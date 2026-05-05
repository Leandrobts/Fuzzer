/**
 * TEST: TypedArray Out-of-Bounds via length corruption
 * CORRIGIDO: Valores hexadecimais válidos
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
        // ⚠️ CORRIGIDO: 0xSECRET0 não é válido -> usar 0x5EC10000
        const SECRET_MARKER = 0x5EC10000; // "SEC1" em hex
        for (let i = 0; i < this.ARRAY_SIZE; i++) {
            this.secretArray[i] = SECRET_MARKER + i;
        }
        this.secretArray[0] = SECRET_MARKER;
        
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
            
        // Flags para validação
        this.oobView = null;
        this.oobData = undefined;
        this.bigViewData = null;
        this.dvReads = null;
        this.definePropError = null;
        this.setError = null;
        this.copyError = null;
        this.subarrayError = null;
        this.sliceError = null;
        this.dvError = null;
        this.oobViewError = null;
        this.bigViewError = null;
    },
    
    probe: [
    // Probe 0: Length do target array (CORRIGIDO - verifica valor real)
    function(scenario) {
        try {
            // Verifica o length REAL (não o que tentamos setar)
            const realLength = scenario.targetArray?.length ?? -1;
            // Também verifica se conseguimos acessar posição length (deveria ser undefined)
            const accessBeyond = scenario.targetArray[realLength];
            return {
                length: realLength,
                accessBeyond: accessBeyond !== undefined ? 'OOB_ACCESS' : 'UNDEFINED_OK'
            };
        } catch (e) {
            return { length: -1, error: e.message.slice(0, 30) };
        }
    },
    

        
        // Probe 2: Valor na posição 0 (deveria ser 0xAAAAAAAA)
        function(scenario) {
            try {
                return '0x' + (scenario.targetArray[0]?.toString(16) ?? 'ERROR');
            } catch (e) {
                return 'ERROR_' + e.message.slice(0, 20);
            }
        },
        
        // Probe 3: Acesso OOB (posição length)
        function(scenario) {
            try {
                const len = scenario.targetArray?.length ?? 0;
                const val = scenario.targetArray[len];
                return val !== undefined ? '0x' + val.toString(16) : 'UNDEFINED';
            } catch (e) {
                return 'ERROR_' + e.message.slice(0, 20);
            }
        },
        
        // Probe 4: Spy array integridade
        function(scenario) {
            try {
                return '0x' + (scenario.spyArray[0]?.toString(16) ?? 'ERROR');
            } catch (e) {
                return 'ERROR';
            }
        }
    ],
    
    trigger: function() {
        // Ataque 1: Tenta modificar length via defineProperty
        try {
            Object.defineProperty(this.targetArray, 'length', {
                value: 1000000,
                writable: true,
                configurable: true
            });
        } catch (e) {
            this.definePropError = e.message;
        }
        
        // Ataque 2: Tenta setar length diretamente
        try {
            this.targetArray.length = 1000000;
        } catch (e) {
            // Esperado falhar em strict mode / TypedArrays
        }
        
        // Ataque 3: Cria view com offset malicioso
        try {
            const buffer = this.targetArray.buffer;
            // Tenta criar view começando ANTES do buffer (offset negativo)
            const oobView = new Uint32Array(buffer, -4, 100);
            this.oobView = oobView;
            this.oobData = oobView[0]; // Leitura antes do buffer!
        } catch (e) {
            this.oobViewError = e.message;
        }
        
        // Ataque 4: View com length maior que o buffer (deve lançar RangeError)
        try {
            const buffer = this.targetArray.buffer;
            const bigView = new Uint32Array(buffer, 0, 1000000);
            // Se chegou aqui, conseguiu criar view gigante!
            this.bigViewData = [];
            for (let i = this.ARRAY_SIZE; i < Math.min(this.ARRAY_SIZE + 10, 1000000); i++) {
                try {
                    this.bigViewData.push({
                        index: i,
                        value: '0x' + bigView[i]?.toString(16)
                    });
                } catch (e) {
                    this.bigViewData.push({ index: i, error: e.message });
                    break;
                }
            }
        } catch (e) {
            this.bigViewError = e.message;
        }
        
        // Ataque 5: DataView com getFloat64 em posições inválidas
        try {
            const dv = new DataView(this.targetArray.buffer);
            this.dvReads = [];
            
            // Testa offsets negativos, zero, normais e além
            const testOffsets = [-8, -4, 0, 4, 8, 
                                this.targetArray.byteLength - 8,
                                this.targetArray.byteLength,
                                this.targetArray.byteLength + 4];
            
            for (const offset of testOffsets) {
                try {
                    const value = dv.getFloat64(offset, true);
                    this.dvReads.push({ offset, value, error: null });
                } catch (e) {
                    this.dvReads.push({ offset, value: null, error: e.message });
                }
            }
        } catch (e) {
            this.dvError = e.message;
        }
        
        // Ataque 6: copyWithin além dos limites
        try {
            // Tenta copiar de posições além do array
            this.targetArray.copyWithin(0, this.ARRAY_SIZE, this.ARRAY_SIZE + 10);
        } catch (e) {
            this.copyError = e.message;
        }
        
        // Ataque 7: subarray com índices negativos
        try {
            const sub = this.targetArray.subarray(-10, 100);
            // Se criou, tenta acessar
            const val = sub[0];
            this.subarrayResult = { length: sub.length, firstVal: val };
        } catch (e) {
            this.subarrayError = e.message;
        }
        
        // Ataque 8: set() com array maior que o target
        try {
            const bigSource = new Uint32Array(1000);
            bigSource.fill(0x13371337);
            this.targetArray.set(bigSource);
            this.setResult = 'SET_SUCCESS_WITH_OVERFLOW';
        } catch (e) {
            this.setError = e.message;
        }
        
        // Força GC após ataques
        if (typeof gc === 'function') {
            gc();
            gc(); // Dupla para garantir
        }
    },
    
    cleanup: function() {
        this.targetArray = null;
        this.spyArray = null;
        this.secretArray = null;
        this.groomArrays = null;
        this.oobView = null;
        this.bigViewData = null;
        this.dvReads = null;
        this.weakTarget = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se length foi corrompido (aumentou)
        if (afterResults[0] > this.ARRAY_SIZE) {
            return {
                anomaly: true,
                reason: `💥 LENGTH CORRUPTION: length do TypedArray alterado de ${this.ARRAY_SIZE} para ${afterResults[0]}!`
            };
        }
        
        // Verifica se byteLength mudou (corrupção estrutural)
        if (afterResults[1] !== baseResults[1] && afterResults[1] > 0) {
            return {
                anomaly: true,
                reason: `🏆 BUFFER CORRUPTION: byteLength alterado de ${baseResults[1]} para ${afterResults[1]}`
            };
        }
        
        // Verifica OOB view com offset negativo (MUITO CRÍTICO)
        if (this.oobView && this.oobData !== undefined) {
            return {
                anomaly: true,
                reason: `💥 OOB VIEW CREATED: View com offset negativo criada! Leitura antes do buffer: 0x${this.oobData?.toString(16)}`
            };
        }
        
        // Verifica bigView (length > buffer real)
        if (this.bigViewData && this.bigViewData.length > 0) {
            const validReads = this.bigViewData.filter(r => !r.error);
            if (validReads.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 VIEW LENGTH BYPASS: View com length 1000000 criada em buffer de ${this.targetArray?.buffer?.byteLength} bytes! ${validReads.length} leituras OOB bem-sucedidas. Primeiro: ${JSON.stringify(validReads[0])}`
                };
            }
        }
        
        // Verifica DataView com offset negativo
        if (this.dvReads) {
            const negativeReads = this.dvReads.filter(r => r.offset < 0 && !r.error);
            if (negativeReads.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 DATAVIEW NEGATIVE OFFSET: ${negativeReads.length} leituras com offset negativo! ${JSON.stringify(negativeReads[0])}`
                };
            }
        }
        
        // Verifica set() com overflow
        if (this.setResult === 'SET_SUCCESS_WITH_OVERFLOW') {
            return {
                anomaly: true,
                reason: `💥 SET OVERFLOW: set() com array maior que o target não lançou erro! Possível escrita OOB.`
            };
        }
        
        // Verifica subarray com índices negativos
        if (this.subarrayResult && this.subarrayResult.length > 0) {
            return {
                anomaly: true,
                reason: `🏆 SUBARRAY NEGATIVE: subarray(-10, 100) criou view de length=${this.subarrayResult.length}. Primeiro valor: ${this.subarrayResult.firstVal}`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};
