/**
 * TEST: DataView OOB via Offset Calculation (CORRIGIDO)
 * Foca APENAS em offsets que deveriam ser bloqueados
 * PS4 13.50: DataView disponível
 */

export const testDataviewOobPrecise = {
    id: 'DATAVIEW_OOB_PRECISE',
    name: 'DataView Precision OOB',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'Tenta OOB via DataView com offsets que deveriam ser inválidos',
    ps4Compatible: true,

    setup: function() {
        this.BUFFER_SIZE = 64;
        this.SPY_COUNT = 100;

        // Buffer alvo
        this.targetBuffer = new ArrayBuffer(this.BUFFER_SIZE);
        this.targetView = new Uint32Array(this.targetBuffer);
        for (let i = 0; i < this.targetView.length; i++) {
            this.targetView[i] = 0xDEAD0000 + i;
        }

        // DataView sobre o buffer
        this.dv = new DataView(this.targetBuffer);

        // Spy buffers
        this.spyBuffers = [];
        for (let i = 0; i < this.SPY_COUNT; i++) {
            const buf = new ArrayBuffer(64);
            const view = new Uint32Array(buf);
            view.fill(0xBBBB0000 + i);
            this.spyBuffers.push({ buffer: buf, view: view, index: i });
        }

        // Resultados
        this.oobAccessDetected = false;
        this.intOverflowSuccess = false;
        this.constructorOobSuccess = false;
        this.writeOobSuccess = false;
    },

    probe: [
        // Probe 0: byteLength do buffer (não deve mudar)
        function(scenario) {
            return scenario.targetBuffer?.byteLength ?? -1;
        },

        // Probe 1: Primeiro elemento (posição segura, referência)
        function(scenario) {
            try {
                return scenario.dv.getUint32(0, true);
            } catch (e) {
                return -1;
            }
        },

        // Probe 2: Tentativa de leitura OOB (offset = byteLength + 4)
        // ⚠️ Isso DEVERIA lançar erro. Se retornar valor, é OOB confirmado!
        function(scenario) {
            try {
                const oobOffset = scenario.targetBuffer.byteLength + 4; // 68 (4 bytes além)
                const val = scenario.dv.getUint32(oobOffset, true);
                scenario.oobAccessDetected = true;
                return val; // Se chegou aqui, OOB funcionou!
            } catch (e) {
                return -1; // Bloqueado corretamente
            }
        },

        // Probe 3: Tentativa de leitura com offset negativo
        function(scenario) {
            try {
                const val = scenario.dv.getUint32(-4, true);
                scenario.oobAccessDetected = true;
                return val;
            } catch (e) {
                return -1;
            }
        },

        // Probe 4: Spy buffer 0 íntegro?
        function(scenario) {
            try {
                return scenario.spyBuffers[0]?.view[0] ?? -1;
            } catch (e) {
                return -1;
            }
        },

        // Probe 5: Tentativa de escrita OOB (offset = byteLength)
        function(scenario) {
            try {
                const oobOffset = scenario.targetBuffer.byteLength; // 64 (exatamente no fim)
                scenario.dv.setUint32(oobOffset, 0x13371337, true);
                // Se NÃO lançou erro, verifica se afetou algo
                scenario.writeOobSuccess = true;
                return 1;
            } catch (e) {
                return 0; // Bloqueado corretamente
            }
        }
    ],

    trigger: function() {
        // ==========================================
        // ATAQUE 1: Integer overflow no offset
        // ==========================================
        this.intOverflowResults = [];
        const overflowOffsets = [
            0xFFFFFFFF,       // -1 em signed (deveria lançar erro)
            0xFFFFFFFC,       // -4 em signed
            4294967292,        // UINT_MAX - 4
        ];

        for (const offset of overflowOffsets) {
            try {
                // Tenta criar novo DataView com byteOffset enorme
                const subDV = new DataView(this.targetBuffer, offset);
                const val = subDV.getUint32(0, true);
                this.intOverflowResults.push({
                    offset: '0x' + offset.toString(16),
                    value: '0x' + val.toString(16),
                    success: true
                });
                this.intOverflowSuccess = true;
            } catch (e) {
                this.intOverflowResults.push({
                    offset: '0x' + offset.toString(16),
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 2: Construtor com byteOffset negativo
        // ==========================================
        this.constructorResults = [];
        const constructorOffsets = [-4, -8, -16, -64];

        for (const byteOffset of constructorOffsets) {
            try {
                const subDV = new DataView(this.targetBuffer, byteOffset);
                const val = subDV.getUint32(0, true);
                this.constructorResults.push({
                    byteOffset,
                    firstValue: '0x' + val.toString(16),
                    success: true
                });
                this.constructorOobSuccess = true;
            } catch (e) {
                this.constructorResults.push({
                    byteOffset,
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 3: getFloat64 em offsets parciais
        // ==========================================
        this.floatResults = [];
        // Tenta ler float64 (8 bytes) nos últimos 7 bytes do buffer
        // Qualquer offset > (BUFFER_SIZE - 8) deveria ser inválido para float64
        for (let offset = this.BUFFER_SIZE - 7; offset <= this.BUFFER_SIZE + 4; offset++) {
            try {
                const val = this.dv.getFloat64(offset, true);
                this.floatResults.push({
                    offset,
                    float64: val,
                    success: true
                });
                if (offset > this.BUFFER_SIZE - 8) {
                    this.oobAccessDetected = true;
                }
            } catch (e) {
                this.floatResults.push({
                    offset,
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 4: getBigInt64 OOB
        // ==========================================
        this.bigIntResults = [];
        if (typeof BigInt !== 'undefined') {
            for (let offset = this.BUFFER_SIZE - 7; offset <= this.BUFFER_SIZE + 4; offset++) {
                try {
                    const val = this.dv.getBigInt64(offset, true);
                    this.bigIntResults.push({
                        offset,
                        value: '0x' + val.toString(16),
                        success: true
                    });
                    if (offset > this.BUFFER_SIZE - 8) {
                        this.oobAccessDetected = true;
                    }
                } catch (e) {
                    this.bigIntResults.push({ offset, success: false });
                }
            }
        }

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.targetBuffer = null;
        this.targetView = null;
        this.dv = null;
        this.spyBuffers = null;
    },

    customValidator: function(baseResults, afterResults) {
        // 1. Leitura OOB confirmada? (Probe 2 ou 3 retornou valor != -1)
        if (afterResults[2] !== -1 && afterResults[2] !== undefined) {
            return {
                anomaly: true,
                reason: `💥💥💥 DATAVIEW OOB READ CONFIRMADO! Leitura além do buffer retornou 0x${afterResults[2]?.toString(16)}`
            };
        }

        if (afterResults[3] !== -1 && afterResults[3] !== undefined) {
            return {
                anomaly: true,
                reason: `💥💥💥 DATAVIEW NEGATIVE OFFSET READ! Leitura com offset negativo retornou 0x${afterResults[3]?.toString(16)}`
            };
        }

        // 2. Escrita OOB confirmada? (Probe 5 retornou 1)
        if (afterResults[5] === 1) {
            return {
                anomaly: true,
                reason: `💥💥💥 DATAVIEW OOB WRITE! Escrita no offset byteLength NÃO lançou erro!`
            };
        }

        // 3. Integer overflow no construtor?
        if (this.intOverflowSuccess) {
            const success = this.intOverflowResults?.filter(r => r.success);
            if (success && success.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 DATAVIEW INT OVERFLOW: Construtor com offset 0x${success[0].offset} criou DataView e leu ${success[0].value}`
                };
            }
        }

        // 4. Construtor com byteOffset negativo?
        if (this.constructorOobSuccess) {
            const success = this.constructorResults?.filter(r => r.success);
            if (success && success.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 DATAVIEW NEGATIVE CONSTRUCTOR: DataView criado com byteOffset=${success[0].byteOffset}, leu ${success[0].firstValue}`
                };
            }
        }

        // 5. Float64 OOB?
        if (this.floatResults) {
            const oob = this.floatResults.filter(r => r.offset > this.BUFFER_SIZE - 8 && r.success);
            if (oob.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 FLOAT64 OOB: getFloat64 no offset ${oob[0].offset} (deveria ser inválido) retornou ${oob[0].float64}`
                };
            }
        }

        // 6. Spy corrompido?
        if (afterResults[4] !== 0xBBBB0000 && afterResults[4] !== -1) {
            return {
                anomaly: true,
                reason: `💥 SPY CORRUPTION: Spy buffer corrompido via DataView OOB! 0x${afterResults[4]?.toString(16)}`
            };
        }

        return { anomaly: false, reason: '' };
    }
};
