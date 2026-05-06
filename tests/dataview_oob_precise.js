/**
 * TEST: DataView OOB via Offset Calculation
 * Explora DataView com offsets calculados para contornar bounds checking
 * PS4 13.50: DataView disponível, sem SharedArrayBuffer
 */

export const testDataviewOobPrecise = {
    id: 'DATAVIEW_OOB_PRECISE',
    name: 'DataView Precision OOB',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'Tenta OOB via DataView com offsets calculados e wrapping de inteiros',
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

        // Spy buffers (alocados após)
        this.spyBuffers = [];
        for (let i = 0; i < this.SPY_COUNT; i++) {
            const buf = new ArrayBuffer(64);
            const view = new Uint32Array(buf);
            view.fill(0xBBBB0000 + i);
            this.spyBuffers.push({ buffer: buf, view: view, index: i });
        }

        // Resultados
        this.oobReadResults = [];
        this.oobWriteResults = [];
        this.intOverflowResults = [];
    },

    probe: [
        // Probe 0: byteLength do buffer
        function(scenario) {
            return scenario.targetBuffer?.byteLength ?? -1;
        },

        // Probe 1: DataView.byteLength
        function(scenario) {
            return scenario.dv?.byteLength ?? -1;
        },

        // Probe 2: Leitura no limite (offset = byteLength - 4)
        function(scenario) {
            try {
                const offset = scenario.targetBuffer.byteLength - 4;
                return scenario.dv.getUint32(offset, true);
            } catch (e) {
                return -1;
            }
        },

        // Probe 3: Leitura 1 byte além (offset = byteLength - 3)
        function(scenario) {
            try {
                const offset = scenario.targetBuffer.byteLength - 3;
                return scenario.dv.getUint32(offset, true);
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
        }
    ],

    trigger: function() {
        // ==========================================
        // ATAQUE 1: Wrapping de inteiro no offset
        // ==========================================
        // Se offset for muito grande, pode causar integer overflow
        // e acessar posições antes do buffer
        this.intOverflowResults = [];

        const overflowOffsets = [
            0xFFFFFFFF,       // -1 em signed int32
            0xFFFFFFFC,       // -4 em signed int32
            0x80000000,       // INT_MIN
            0x7FFFFFFF,       // INT_MAX
            4294967292,        // Próximo de UINT_MAX - 4
        ];

        for (const offset of overflowOffsets) {
            try {
                const val = this.dv.getUint32(offset, true);
                this.intOverflowResults.push({
                    offset: '0x' + offset.toString(16),
                    signedOffset: offset | 0, // cast para signed
                    value: '0x' + val.toString(16),
                    success: true
                });
            } catch (e) {
                this.intOverflowResults.push({
                    offset: '0x' + offset.toString(16),
                    error: e.message,
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 2: Float64 nas bordas do buffer
        // ==========================================
        this.doubleEdgeResults = [];
        const edgeOffsets = [
            -8, -7, -6, -5, -4, -3, -2, -1,  // Antes do buffer
            0, 1, 2, 3,                        // Início
            this.BUFFER_SIZE - 8,              // Último float64 válido
            this.BUFFER_SIZE - 7,              // Penúltimo + 1
            this.BUFFER_SIZE - 4,              // Último float32
            this.BUFFER_SIZE - 1,              // Último byte
            this.BUFFER_SIZE,                  // Exatamente no fim
            this.BUFFER_SIZE + 1,              // 1 byte além
            this.BUFFER_SIZE + 4,              // 4 bytes além
        ];

        for (const offset of edgeOffsets) {
            try {
                // Tenta ler como float64 (8 bytes)
                const val = this.dv.getFloat64(offset, true);
                const buf = new ArrayBuffer(8);
                const f64 = new Float64Array(buf);
                f64[0] = val;
                const u32 = new Uint32Array(buf);

                this.doubleEdgeResults.push({
                    offset,
                    float64: val,
                    asU32lo: '0x' + u32[0].toString(16),
                    asU32hi: '0x' + u32[1].toString(16),
                    success: true
                });
            } catch (e) {
                this.doubleEdgeResults.push({
                    offset,
                    error: e.message.slice(0, 40),
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 3: DataView com byteOffset no construtor
        // ==========================================
        this.constructorOffsetResults = [];
        const constructorOffsets = [
            -4, -8, -16,                        // Negativos
            this.BUFFER_SIZE - 4,               // No limite
            this.BUFFER_SIZE,                   // Exato
            this.BUFFER_SIZE / 2,               // Metade
        ];

        for (const byteOffset of constructorOffsets) {
            try {
                const subDV = new DataView(this.targetBuffer, byteOffset);
                const val = subDV.getUint32(0, true);
                this.constructorOffsetResults.push({
                    byteOffset,
                    byteLength: subDV.byteLength,
                    firstValue: '0x' + val.toString(16),
                    success: true
                });
            } catch (e) {
                this.constructorOffsetResults.push({
                    byteOffset,
                    error: e.message.slice(0, 40),
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 4: Escrita nas bordas
        // ==========================================
        this.edgeWriteResults = [];
        const writeOffsets = [
            -4,                                // Antes do buffer
            0,                                 // Início (legal)
            this.BUFFER_SIZE - 4,              // Último válido
            this.BUFFER_SIZE,                  // Exatamente no fim
            this.BUFFER_SIZE + 4,              // Além
        ];

        for (const offset of writeOffsets) {
            try {
                this.dv.setUint32(offset, 0x13371337, true);
                const verify = this.dv.getUint32(offset, true);
                this.edgeWriteResults.push({
                    offset,
                    written: '0x13371337',
                    verified: '0x' + verify.toString(16),
                    persisted: verify === 0x13371337,
                    success: true
                });
            } catch (e) {
                this.edgeWriteResults.push({
                    offset,
                    error: e.message.slice(0, 40),
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 5: getBigInt64 para vazar 8 bytes
        // ==========================================
        this.bigIntResults = [];
        if (typeof BigInt !== 'undefined') {
            const bigIntOffsets = [
                -8, -4, 0, 4,
                this.BUFFER_SIZE - 8,
                this.BUFFER_SIZE - 4,
                this.BUFFER_SIZE,
            ];

            for (const offset of bigIntOffsets) {
                try {
                    const val = this.dv.getBigInt64(offset, true);
                    this.bigIntResults.push({
                        offset,
                        value: '0x' + val.toString(16),
                        success: true
                    });
                } catch (e) {
                    this.bigIntResults.push({
                        offset,
                        error: e.message.slice(0, 40),
                        success: false
                    });
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
        // 1. Integer overflow no offset
        if (this.intOverflowResults) {
            const successes = this.intOverflowResults.filter(r => r.success);
            if (successes.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 INT OVERFLOW: ${successes.length} leituras com offset overflow. Ex: offset=0x${successes[0].offset} -> ${successes[0].value}`
                };
            }
        }

        // 2. Float64 nas bordas
        if (this.doubleEdgeResults) {
            const negative = this.doubleEdgeResults.filter(r => r.offset < 0 && r.success);
            const beyond = this.doubleEdgeResults.filter(r => r.offset > this.BUFFER_SIZE - 8 && r.success);

            if (negative.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 FLOAT64 NEGATIVE OFFSET: Leitura com offset ${negative[0].offset} retornou ${negative[0].asU32lo}`
                };
            }
            if (beyond.length > 0) {
                return {
                    anomaly: true,
                    reason: `🏆 FLOAT64 OOB: Leitura além do buffer (offset ${beyond[0].offset}) retornou ${beyond[0].asU32lo}`
                };
            }
        }

        // 3. Construtor com offset
        if (this.constructorOffsetResults) {
            const negative = this.constructorOffsetResults.filter(r => r.byteOffset < 0 && r.success);
            if (negative.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 DATAVIEW NEGATIVE CONSTRUCTOR: DataView criado com byteOffset=${negative[0].byteOffset}`
                };
            }
        }

        // 4. Escrita OOB
        if (this.edgeWriteResults) {
            const oob = this.edgeWriteResults.filter(r => (r.offset < 0 || r.offset >= this.BUFFER_SIZE) && r.success);
            if (oob.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 DATAVIEW OOB WRITE: Escrita em offset ${oob[0].offset} persistiu!`
                };
            }
        }

        // 5. Spy corrompido
        if (afterResults[4] !== 0xBBBB0000 && afterResults[4] !== -1) {
            return {
                anomaly: true,
                reason: `💥 SPY CORRUPTION VIA DATAVIEW: Spy[0] alterado para 0x${afterResults[4]?.toString(16)}`
            };
        }

        return { anomaly: false, reason: '' };
    }
};
