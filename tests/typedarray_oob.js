/**
 * TEST: TypedArray Out-of-Bounds via length corruption
 * Tenta corromper length de TypedArray para acessar memória arbitrária
 * PS4 13.50: TypedArrays disponíveis, alvo principal de exploits
 */

export const testTypedarrayOob = {
    id: 'TYPEDARRAY_OOB',
    name: 'TypedArray OOB Access',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'Tenta corromper .length de TypedArray para leitura/escrita OOB',
    ps4Compatible: true,
    
    setup: function() {
        this.ARRAY_SIZE = 16;
        this.GROOM_COUNT = 200;
        
        // Arrays que tentaremos corromper
        this.targetArray = new Uint32Array(this.ARRAY_SIZE);
        this.targetArray.fill(0xAAAAAAAA);
        
        // Array espião (para detectar vazamento)
        this.spyArray = new Uint32Array(this.ARRAY_SIZE);
        this.spyArray.fill(0xBBBBBBBB);
        
        // Array com dados sensíveis simulados
        this.secretArray = new Uint32Array(this.ARRAY_SIZE);
        for (let i = 0; i < this.ARRAY_SIZE; i++) {
            this.secretArray[i] = 0xDEAD0000 + i;
        }
        this.secretArray[0] = 0xSECRET0; // Marcador especial
        
        // Grooming: cria muitos arrays para heap feng shui
        this.groomArrays = [];
        for (let i = 0; i < this.GROOM_COUNT; i++) {
            const arr = new Float64Array(this.ARRAY_SIZE);
            arr.fill(i * 1.5);
            this.groomArrays.push(arr);
        }
        
        // Armazena referência fraca
        this.weakTarget = typeof WeakRef !== 'undefined' ? 
            new WeakRef(this.targetArray) : null;
    },
    
    probe: [
        // Probe 0: Length do target array
        function(scenario) {
            return scenario.targetArray?.length ?? -1;
        },
        
        // Probe 1: ByteLength do buffer subjacente
        function(scenario) {
            return scenario.targetArray?.buffer?.byteLength ?? -1;
        },
        
        // Probe 2: Valor na posição 0 (deveria ser 0xAAAAAAAA)
        function(scenario) {
            try {
                return '0x' + scenario.targetArray[0]?.toString(16);
            } catch (e) {
                return 'ERROR';
            }
        },
        
        // Probe 3: Acesso OOB (posição length)
        function(scenario) {
            try {
                return '0x' + scenario.targetArray[scenario.targetArray.length]?.toString(16);
            } catch (e) {
                return 'ERROR';
            }
        },
        
        // Probe 4: Spy array integridade
        function(scenario) {
            return '0x' + scenario.spyArray[0]?.toString(16);
        }
    ],
    
    trigger: function() {
        // Ataque 1: Tenta modificar length via defineProperty
        try {
            Object.defineProperty(this.targetArray, 'length', {
                value: 1000000,
                writable: true
            });
        } catch (e) {
            this.definePropError = e.message;
        }
        
        // Ataque 2: Tenta setar length diretamente
        try {
            this.targetArray.length = 1000000;
        } catch (e) {
            // Esperado falhar
        }
        
        // Ataque 3: Cria view com offset malicioso
        try {
            const buffer = this.targetArray.buffer;
            // Tenta criar view começando ANTES do buffer
            const oobView = new Uint32Array(buffer, -4, 100);
            this.oobView = oobView;
            this.oobData = oobView[0]; // Leitura antes do buffer!
        } catch (e) {
            this.oobViewError = e.message;
        }
        
        // Ataque 4: View com length maior que o buffer
        try {
            const buffer = this.targetArray.buffer;
            const bigView = new Uint32Array(buffer, 0, 1000000);
            // Tenta acessar posição além
            this.bigViewData = [];
            for (let i = this.ARRAY_SIZE; i < this.ARRAY_SIZE + 10; i++) {
                try {
                    this.bigViewData.push(bigView[i]);
                } catch (e) {
                    this.bigViewData.push('CRASH_' + i);
                    break;
                }
            }
        } catch (e) {
            this.bigViewError = e.message;
        }
        
        // Ataque 5: DataView com getFloat64 em posições não alinhadas
        try {
            const dv = new DataView(this.targetArray.buffer);
            // Lê float nas bordas e além
            this.dvReads = [];
            for (let offset = -8; offset <= this.targetArray.byteLength + 8; offset += 4) {
                try {
                    this.dvReads.push({
                        offset,
                        value: dv.getFloat64(offset, true)
                    });
                } catch (e) {
                    this.dvReads.push({ offset, error: e.message });
                }
            }
        } catch (e) {
            this.dvError = e.message;
        }
        
        // Força GC
        if (typeof gc === 'function') gc();
    },
    
    cleanup: function() {
        this.targetArray = null;
        this.spyArray = null;
        this.secretArray = null;
        this.groomArrays = null;
        this.oobView = null;
        this.bigViewData = null;
        this.dvReads = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se length foi corrompido
        if (afterResults[0] > this.ARRAY_SIZE || afterResults[0] === 1000000) {
            return {
                anomaly: true,
                reason: `💥 LENGTH CORRUPTION: length do array alterado para ${afterResults[0]}!`
            };
        }
        
        // Verifica se byteLength mudou (corrupção de estrutura interna)
        if (afterResults[1] !== baseResults[1] && afterResults[1] > 0) {
            return {
                anomaly: true,
                reason: `🏆 BUFFER CORRUPTION: byteLength alterado de ${baseResults[1]} para ${afterResults[1]}`
            };
        }
        
        // Verifica OOB view
        if (this.oobView && this.oobData !== undefined) {
            return {
                anomaly: true,
                reason: `💥 OOB VIEW CREATED: View com offset negativo criada! Leitura: 0x${this.oobData?.toString(16)}`
            };
        }
        
        // Verifica DataView OOB
        if (this.dvReads) {
            const negativeReads = this.dvReads.filter(r => r.offset < 0 && !r.error);
            const beyondReads = this.dvReads.filter(r => r.offset >= this.ARRAY_SIZE * 4 && !r.error);
            
            if (negativeReads.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 DV NEGATIVE OFFSET: DataView leu em offset negativo: ${JSON.stringify(negativeReads.slice(0, 3))}`
                };
            }
            
            if (beyondReads.length > 0) {
                return {
                    anomaly: true,
                    reason: `🏆 DV OOB READ: DataView leu além do buffer: ${JSON.stringify(beyondReads.slice(0, 3))}`
                };
            }
        }
        
        return { anomaly: false, reason: '' };
    }
};
