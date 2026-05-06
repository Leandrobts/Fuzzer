/**
 * TEST: TypedArray Out-of-Bounds via length corruption
 * CORRIGIDO: Probes ignoram length change, só detectam OOB real
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
        this.floatLeak = null;
        this.sliceResult = null;
        
        // ⚠️ NOVAS FLAGS - só disparam com OOB real
        this.lengthCorrupted = false;
        this.oobAccessSuccessful = false;
        this.oobWriteSuccessful = false;
        this.leakedDataFromOOB = null;
    },
    
    probe: [
        // Probe 0: OOB detectado? (0=Não, 1=Sim — IGNORA length change)
        function(scenario) {
            return (scenario.oobAccessSuccessful || scenario.oobWriteSuccessful) ? 1 : 0;
        },
        
        // Probe 1: ByteLength do buffer subjacente (deve permanecer 64)
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
        
        // Probe 3: Acesso OOB (posição 20 - além do original)
        function(scenario) {
            try {
                const val = scenario.targetArray[20];
                if (val !== undefined) {
                    scenario.oobAccessSuccessful = true;
                    return val;
                }
                return -1;
            } catch (e) {
                return -1;
            }
        },
        
        // Probe 4: Spy array integridade
        function(scenario) {
            try {
                return scenario.spyArray[0] ?? -1;
            } catch (e) {
                return -1;
            }
        },
        
        // Probe 5: Tentativa de escrita OOB (posição 20)
        function(scenario) {
            try {
                const before = scenario.targetArray[20];
                scenario.targetArray[20] = 0xCAFEBABE;
                const after = scenario.targetArray[20];
                
                if (after === 0xCAFEBABE) {
                    scenario.oobWriteSuccessful = true;
                    return 1;
                }
                return 0;
            } catch (e) {
                return -1;
            }
        },
        
        // Probe 6: Scan de dados vazados
        function(scenario) {
            try {
                const leaked = [];
                for (let i = scenario.ARRAY_SIZE; i < Math.min(scenario.targetArray.length, scenario.ARRAY_SIZE + 50); i++) {
                    const val = scenario.targetArray[i];
                    if (val !== undefined && val !== 0xAAAAAAAA && val !== 0xCAFEBABE) {
                        leaked.push({ index: i, value: '0x' + val.toString(16) });
                    }
                }
                
                if (leaked.length > 0) {
                    scenario.leakedDataFromOOB = leaked;
                    scenario.oobAccessSuccessful = true;
                }
                
                return leaked.length;
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
            // Esperado falhar
        }
        
        // Ataque 3: Cria view com offset negativo
        try {
            const buffer = this.targetArray.buffer;
            const oobView = new Uint32Array(buffer, -4, 100);
            this.oobView = oobView;
            this.oobData = oobView[0];
            this.oobAccessSuccessful = true;
        } catch (e) {
            this.oobViewError = e.message;
        }
        
        // Ataque 4: View com length maior que buffer
        try {
            const buffer = this.targetArray.buffer;
            const bigView = new Uint32Array(buffer, 0, 1000000);
            this.bigViewData = [];
            for (let i = this.ARRAY_SIZE; i < Math.min(this.ARRAY_SIZE + 20, 1000000); i++) {
                try {
                    const val = bigView[i];
                    this.bigViewData.push({
                        index: i,
                        value: '0x' + val?.toString(16)
                    });
                    if (val !== undefined) this.oobAccessSuccessful = true;
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
                    if (offset < 0 || offset >= this.targetArray.byteLength) {
                        this.oobAccessSuccessful = true;
                    }
                } catch (e) {
                    this.dvReads.push({ offset, value: null, error: e.message });
                }
            }
        } catch (e) {
            this.dvError = e.message;
        }
        
        // Ataque 6: copyWithin com índices OOB
        try {
            this.targetArray.copyWithin(0, this.ARRAY_SIZE, this.ARRAY_SIZE + 10);
        } catch (e) {
            this.copyError = e.message;
        }
        
        // Ataque 7: subarray negativo
        try {
            const sub = this.targetArray.subarray(-10, 100);
            if (sub && sub.length > 0) {
                this.subarrayResult = { 
                    length: sub.length, 
                    firstVal: '0x' + sub[0]?.toString(16)
                };
                this.oobAccessSuccessful = true;
            }
        } catch (e) {
            this.subarrayError = e.message;
        }
        
        // Ataque 8: set() com overflow
        try {
            const bigSource = new Uint32Array(1000);
            bigSource.fill(0x13371337);
            this.targetArray.set(bigSource);
            this.setResult = 'SET_OVERFLOW_SUCCESS';
            this.oobWriteSuccessful = true;
        } catch (e) {
            this.setError = e.message;
        }
        
        // Ataque 9: slice OOB
        try {
            const sliced = this.targetArray.slice(0, this.ARRAY_SIZE + 10);
            if (sliced && sliced.length > this.ARRAY_SIZE) {
                this.sliceResult = {
                    requested: this.ARRAY_SIZE + 10,
                    actual: sliced.length,
                    extraData: Array.from(sliced.slice(this.ARRAY_SIZE)).map(v => '0x' + v.toString(16))
                };
                this.oobAccessSuccessful = true;
            }
        } catch (e) {
            this.sliceError = e.message;
        }
        
        // Ataque 10: Float64 leak detection
        try {
            const floatView = new Float64Array(this.targetArray.buffer);
            this.floatLeak = [];
            for (let i = 0; i < Math.min(floatView.length, 10); i++) {
                const val = floatView[i];
                this.floatLeak.push({
                    index: i,
                    value: val,
                    isPointer: Math.abs(val) > 100000 && Math.abs(val) < 0x7FFFFFFFFFFF
                });
            }
        } catch (e) {
            this.floatError = e.message;
        }
        
        // Ataque 11: Tentativa de leitura massiva OOB
        if (this.lengthCorrupted) {
            try {
                const leaked = [];
                for (let i = this.ARRAY_SIZE; i < Math.min(this.targetArray.length, this.ARRAY_SIZE + 100); i++) {
                    const val = this.targetArray[i];
                    if (val !== undefined && val !== 0xAAAAAAAA) {
                        leaked.push({ index: i, value: '0x' + val.toString(16) });
                    }
                }
                if (leaked.length > 0) {
                    this.leakedDataFromOOB = leaked;
                    this.oobAccessSuccessful = true;
                }
            } catch (e) {
                // Silencioso
            }
        }
        
        // Força GC
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
        // ==========================================
        // SÓ DISPARA SE OOB REAL FOR DETECTADO
        // ==========================================
        
        // 1. Escrita OOB confirmada? (MAIS GRAVE)
        if (this.oobWriteSuccessful) {
            return {
                anomaly: true,
                reason: '💥💥💥 OOB WRITE CONFIRMADO: Escrita além do buffer persistiu! Vulnerabilidade de corrupção de memória!'
            };
        }
        
        // 2. Leitura OOB confirmada?
        if (this.oobAccessSuccessful) {
            const details = [];
            
            if (this.oobView && this.oobData !== undefined) {
                details.push(`OOB View: offset negativo, leu 0x${this.oobData.toString(16)}`);
            }
            
            if (this.bigViewData && this.bigViewData.length > 0) {
                const validReads = this.bigViewData.filter(r => !r.error);
                if (validReads.length > 0) {
                    details.push(`BigView: ${validReads.length} leituras OOB`);
                }
            }
            
            if (this.leakedDataFromOOB && this.leakedDataFromOOB.length > 0) {
                details.push(`Data Leak: ${this.leakedDataFromOOB.length} valores vazados`);
                details.push(`Primeiros: ${JSON.stringify(this.leakedDataFromOOB.slice(0, 5))}`);
            }
            
            if (this.sliceResult && this.sliceResult.actual > this.ARRAY_SIZE) {
                details.push(`Slice OOB: ${this.sliceResult.actual} elementos`);
            }
            
            if (this.subarrayResult) {
                details.push(`Subarray negativo: length=${this.subarrayResult.length}`);
            }
            
            return {
                anomaly: true,
                reason: `💥 OOB READ CONFIRMADO!\n${details.join('\n')}`
            };
        }
        
        // 3. DataView OOB?
        if (this.dvReads) {
            const oobReads = this.dvReads.filter(r => 
                (r.offset < 0 || r.offset >= this.ARRAY_SIZE * 4) && !r.error
            );
            if (oobReads.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 DATAVIEW OOB: ${oobReads.length} leituras DataView OOB. offset=${oobReads[0].offset}`
                };
            }
        }
        
        // 4. Spy array corrompido? (indicador de escrita OOB)
        if (afterResults[4] !== 0xBBBBBBBB && afterResults[4] !== -1) {
            return {
                anomaly: true,
                reason: `💥 SPY CORRUPTION: Array espião corrompido! 0xBBBBBBBB -> 0x${afterResults[4]?.toString(16)}`
            };
        }
        
        // 5. Float64 pointer leak?
        if (this.floatLeak) {
            const pointers = this.floatLeak.filter(f => f.isPointer);
            if (pointers.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 FLOAT64 POINTER LEAK: ${pointers.length} possíveis ponteiros vazados`
                };
            }
        }
        
        // Se length mudou mas NADA de OOB foi detectado = NÃO é anomalia
        return { anomaly: false, reason: '' };
    }
};
