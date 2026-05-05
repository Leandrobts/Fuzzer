/**
 * TEST: TypedArray Out-of-Bounds via length corruption
 * VERSÃO COM VERIFICAÇÃO: Confirma se length foi REALMENTE alterado
 * PS4 13.50: Se detectar length corruption real = VULNERABILIDADE CONFIRMADA
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
        
        // Array espião
        this.spyArray = new Uint32Array(this.ARRAY_SIZE);
        this.spyArray.fill(0xBBBBBBBB);
        
        // Array com dados sensíveis simulados
        this.secretArray = new Uint32Array(this.ARRAY_SIZE);
        for (let i = 0; i < this.ARRAY_SIZE; i++) {
            this.secretArray[i] = this.SECRET_MARKER + i;
        }
        this.secretArray[0] = this.SECRET_MARKER;
        
        // Grooming
        this.groomArrays = [];
        for (let i = 0; i < this.GROOM_COUNT; i++) {
            const arr = new Float64Array(this.ARRAY_SIZE);
            arr.fill(i * 1.5);
            this.groomArrays.push(arr);
        }
        
        // Flags de verificação
        this.lengthReallyChanged = false;
        this.oobAccessSuccessful = false;
        this.oobWriteSuccessful = false;
        this.leakedDataFromOOB = null;
        this.originalLength = this.targetArray.length;
        
        // ⚠️ ARMAZENA o valor original do length para comparação
        this.lengthBeforeTrigger = this.targetArray.length;
        
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
    },
    
    probe: [
        // Probe 0: Length REAL do target array
        function(scenario) {
            try {
                // ⚠️ Lê o length DIRETAMENTE do objeto
                const realLength = scenario.targetArray.length;
                
                // Verifica se realmente mudou
                if (realLength !== 16) {
                    scenario.lengthReallyChanged = true;
                }
                
                return realLength;
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
        
        // Probe 3: Acesso OOB (tenta ler posição 20, além do original)
        function(scenario) {
            try {
                // Tenta acessar posição além do tamanho original (16)
                const val = scenario.targetArray[20];
                if (val !== undefined) {
                    scenario.oobAccessSuccessful = true;
                }
                return val !== undefined ? 1 : 0;
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
        
        // Probe 5: VERIFICAÇÃO CRÍTICA - tenta escrever em posição OOB
        function(scenario) {
            try {
                // Tenta escrever na posição 20 (além do original)
                const before = scenario.targetArray[20];
                scenario.targetArray[20] = 0xCAFEBABE;
                const after = scenario.targetArray[20];
                
                if (after === 0xCAFEBABE) {
                    scenario.oobWriteSuccessful = true;
                    return 1; // Escrita OOB bem-sucedida!
                }
                return 0;
            } catch (e) {
                return -1; // Erro (esperado se length não mudou)
            }
        },
        
        // Probe 6: Tenta ler dados vazados de posições OOB
        function(scenario) {
            try {
                const leaked = [];
                // Lê posições além do array original
                for (let i = 16; i < Math.min(scenario.targetArray.length, 30); i++) {
                    const val = scenario.targetArray[i];
                    if (val !== undefined && val !== 0xCAFEBABE) {
                        leaked.push({ index: i, value: '0x' + val.toString(16) });
                    }
                }
                
                if (leaked.length > 0) {
                    scenario.leakedDataFromOOB = leaked;
                }
                
                return leaked.length;
            } catch (e) {
                return -1;
            }
        }
    ],
    
    trigger: function() {
        // ⚠️ ATAQUE PRINCIPAL: Tenta modificar length via defineProperty
        try {
            Object.defineProperty(this.targetArray, 'length', {
                value: 1000000,
                writable: true,
                configurable: true
            });
            
            // VERIFICAÇÃO IMEDIATA
            if (this.targetArray.length === 1000000) {
                this.lengthReallyChanged = true;
                
                // Tenta acessar posição OOB imediatamente
                try {
                    const oobVal = this.targetArray[20];
                    if (oobVal !== undefined) {
                        this.oobAccessSuccessful = true;
                    }
                    
                    // Tenta escrever
                    this.targetArray[20] = 0x41414141;
                    if (this.targetArray[20] === 0x41414141) {
                        this.oobWriteSuccessful = true;
                    }
                } catch (e) {
                    // Se definir length funcionou mas acesso OOB falhou
                }
            }
        } catch (e) {
            this.definePropError = e.message;
        }
        
        // Ataque 2: Tenta setar length diretamente
        try {
            this.targetArray.length = 1000000;
            if (this.targetArray.length === 1000000) {
                this.lengthReallyChanged = true;
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
        this.floatLeak = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // ⚠️ VERIFICAÇÃO PRINCIPAL: Length realmente mudou?
        const lengthBefore = baseResults[0]; // Baseline (deveria ser 16)
        const lengthAfter = afterResults[0];  // Após trigger
        
        // Se length realmente mudou de 16 para outro valor
        if (lengthBefore === 16 && lengthAfter !== 16 && lengthAfter > 0) {
            
            // Verifica se OOB acesso funcionou
            if (afterResults[3] === 1) {
                return {
                    anomaly: true,
                    reason: `💥💥💥 LENGTH CORRUPTION CONFIRMADA: length do TypedArray alterado de 16 para ${lengthAfter}! Acesso OOB confirmado na posição 20!`
                };
            }
            
            // Verifica se OOB escrita funcionou
            if (afterResults[5] === 1) {
                return {
                    anomaly: true,
                    reason: `💥💥💥 OOB WRITE CONFIRMADA: Escrita bem-sucedida além do buffer original! Length alterado para ${lengthAfter}. Vulnerabilidade de escrita arbitrária!`
                };
            }
            
            // Verifica se dados foram vazados
            if (afterResults[6] > 0 && this.leakedDataFromOOB) {
                return {
                    anomaly: true,
                    reason: `💥💥💥 OOB READ CONFIRMADA: ${afterResults[6]} valores vazados de posições OOB! Dados: ${JSON.stringify(this.leakedDataFromOOB.slice(0, 3))}`
                };
            }
            
            // Length mudou mas não conseguiu OOB (falso positivo?)
            return {
                anomaly: true,
                reason: `⚠️ LENGTH ALTERADO (${lengthBefore} -> ${lengthAfter}) mas OOB não confirmado. Possível falsa modificação ou proteção parcial.`
            };
        }
        
        // Verifica OOB view com offset negativo
        if (this.oobView && this.oobData !== undefined) {
            return {
                anomaly: true,
                reason: `💥 OOB VIEW NEGATIVA: View com offset -4 criada! Leitura: 0x${this.oobData?.toString(16)}`
            };
        }
        
        // Verifica view com length bypass
        if (this.bigViewData && this.bigViewData.length > 0) {
            const validReads = this.bigViewData.filter(r => !r.error);
            if (validReads.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 LENGTH BYPASS: View gigante criada. ${validReads.length} leituras OOB. Primeiro: ${JSON.stringify(validReads[0])}`
                };
            }
        }
        
        // Verifica DataView OOB
        if (this.dvReads) {
            const negativeReads = this.dvReads.filter(r => r.offset < 0 && !r.error);
            if (negativeReads.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 DATAVIEW NEGATIVE: Leitura com offset negativo funcionou! offset=${negativeReads[0].offset}`
                };
            }
        }
        
        // Verifica set() overflow
        if (this.setResult === 'SET_OVERFLOW_SUCCESS') {
            return {
                anomaly: true,
                reason: `💥 SET OVERFLOW: set() com 1000 elementos não lançou erro! Possível escrita OOB massiva.`
            };
        }
        
        // Verifica subarray negativo
        if (this.subarrayResult && this.subarrayResult.length > 0) {
            return {
                anomaly: true,
                reason: `🏆 SUBARRAY BYPASS: subarray(-10, 100) criou view de length=${this.subarrayResult.length}`
            };
        }
        
        // Verifica slice OOB
        if (this.sliceResult && this.sliceResult.actual > this.ARRAY_SIZE) {
            return {
                anomaly: true,
                reason: `💥 SLICE OOB: slice retornou ${this.sliceResult.actual} elementos. Extras: ${JSON.stringify(this.sliceResult.extraData)}`
            };
        }
        
        // Verifica Float64 pointer leak
        if (this.floatLeak) {
            const pointers = this.floatLeak.filter(f => f.isPointer);
            if (pointers.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 FLOAT64 LEAK: ${pointers.length} possíveis ponteiros vazados via Float64Array`
                };
            }
        }
        
        // Verifica spy array corrompido
        if (afterResults[4] !== 0xBBBBBBBB && afterResults[4] !== -1) {
            return {
                anomaly: true,
                reason: `💥 SPY CORRUPTION: Array espião corrompido! 0xBBBBBBBB -> 0x${afterResults[4]?.toString(16)}`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};
