/**
 * TEST: Array splice/slice com índices negativos
 * Explora comportamento de índices negativos em operações de array
 * PS4 13.50: Arrays padrão disponíveis
 */

export const testSpliceSliceNegative = {
    id: 'SPLICE_SLICE_NEGATIVE',
    name: 'Splice/Slice Negative Index',
    risk: 'HIGH',
    category: 'TYPES',
    description: 'Tenta OOB via índices negativos em splice, slice e copyWithin',
    ps4Compatible: true,

    setup: function() {
        this.TEST_SIZE = 20;

        // Array alvo
        this.targetArray = new Array(this.TEST_SIZE);
        for (let i = 0; i < this.TEST_SIZE; i++) {
            this.targetArray[i] = 0xAAAA0000 + i;
        }

        // Array espião
        this.spyArray = new Array(this.TEST_SIZE);
        for (let i = 0; i < this.TEST_SIZE; i++) {
            this.spyArray[i] = 0xBBBB0000 + i;
        }

        // TypedArray alvo
        this.targetTyped = new Uint32Array(this.TEST_SIZE);
        for (let i = 0; i < this.TEST_SIZE; i++) {
            this.targetTyped[i] = 0xCCCC0000 + i;
        }

        // Resultados
        this.spliceResults = null;
        this.sliceResults = null;
        this.copyWithinResults = null;
        this.fillResults = null;
    },

    probe: [
        function(scenario) {
            return scenario.targetArray?.length ?? -1;
        },
        function(scenario) {
            try { return scenario.targetArray[0]; } catch(e) { return -1; }
        },
        function(scenario) {
            try { return scenario.spyArray[0]; } catch(e) { return -1; }
        },
        function(scenario) {
            try { return scenario.targetTyped[0]; } catch(e) { return -1; }
        },
        function(scenario) {
            try { return scenario.spyArray[scenario.spyArray.length - 1]; } catch(e) { return -1; }
        }
    ],

    trigger: function() {
        // ==========================================
        // ATAQUE 1: splice com índice muito negativo
        // ==========================================
        this.spliceResults = [];
        const spliceTests = [
            { start: -1000000, deleteCount: 0, desc: 'start muito negativo, delete 0' },
            { start: -1000000, deleteCount: 1000000, desc: 'start e deleteCount enormes' },
            { start: Number.MIN_SAFE_INTEGER, deleteCount: 1, desc: 'MIN_SAFE_INTEGER' },
            { start: -1, deleteCount: -1, desc: 'deleteCount negativo' },
            { start: 0, deleteCount: -1000000, desc: 'deleteCount muito negativo' },
            { start: this.TEST_SIZE + 1000000, deleteCount: 0, desc: 'start muito além' },
        ];

        for (const test of spliceTests) {
            // Faz cópia para cada teste
            const testArr = [...this.targetArray];
            try {
                const removed = testArr.splice(test.start, test.deleteCount);
                this.spliceResults.push({
                    test: test.desc,
                    start: test.start,
                    deleteCount: test.deleteCount,
                    removedLength: removed?.length,
                    resultLength: testArr.length,
                    resultFirst: testArr[0] !== undefined ? '0x' + testArr[0].toString(16) : 'undefined',
                    success: true
                });
            } catch (e) {
                this.spliceResults.push({
                    test: test.desc,
                    error: e.message.slice(0, 40),
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 2: slice com índices extremos
        // ==========================================
        this.sliceResults = [];
        const sliceTests = [
            { start: -1000000, end: 1000000, desc: 'range enorme negativo-positivo' },
            { start: -1000000, end: -1000000, desc: 'ambos muito negativos' },
            { start: Number.MIN_SAFE_INTEGER, end: Number.MAX_SAFE_INTEGER, desc: 'range completo' },
            { start: undefined, end: undefined, desc: 'undefined (default)' },
            { start: null, end: null, desc: 'null' },
            { start: -0, end: -0, desc: '-0 (negative zero)' },
        ];

        for (const test of sliceTests) {
            try {
                const sliced = this.targetArray.slice(test.start, test.end);
                this.sliceResults.push({
                    test: test.desc,
                    start: test.start,
                    end: test.end,
                    sliceLength: sliced?.length,
                    sliceFirst: sliced[0] !== undefined ? '0x' + sliced[0].toString(16) : 'undefined',
                    sliceLast: sliced[sliced.length - 1] !== undefined ? '0x' + sliced[sliced.length - 1].toString(16) : 'undefined',
                    success: true
                });
            } catch (e) {
                this.sliceResults.push({
                    test: test.desc,
                    error: e.message.slice(0, 40),
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 3: copyWithin com índices maliciosos
        // ==========================================
        this.copyWithinResults = [];
        const copyTests = [
            { target: -1000000, start: 0, end: this.TEST_SIZE, desc: 'target muito negativo' },
            { target: 0, start: -1000000, end: this.TEST_SIZE, desc: 'start muito negativo' },
            { target: 0, start: 0, end: -1000000, desc: 'end muito negativo' },
            { target: this.TEST_SIZE + 1000, start: 0, end: 5, desc: 'target além do array' },
            { target: -5, start: this.TEST_SIZE - 5, end: this.TEST_SIZE, desc: 'target negativo normal' },
        ];

        for (const test of copyTests) {
            const testArr = [...this.targetArray];
            try {
                testArr.copyWithin(test.target, test.start, test.end);
                this.copyWithinResults.push({
                    test: test.desc,
                    resultLength: testArr.length,
                    resultFirst: '0x' + testArr[0].toString(16),
                    resultLast: '0x' + testArr[testArr.length - 1].toString(16),
                    success: true
                });
            } catch (e) {
                this.copyWithinResults.push({
                    test: test.desc,
                    error: e.message.slice(0, 40),
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 4: fill com índices extremos
        // ==========================================
        this.fillResults = [];
        const fillTests = [
            { value: 0x13371337, start: -1000000, end: 1000000, desc: 'range enorme' },
            { value: 0xDEADBEEF, start: this.TEST_SIZE - 5, end: this.TEST_SIZE + 1000, desc: 'end além do array' },
            { value: 0xCAFEBABE, start: -1000000, end: -999990, desc: 'range negativo pequeno' },
        ];

        for (const test of fillTests) {
            const testArr = [...this.targetArray];
            try {
                testArr.fill(test.value, test.start, test.end);
                this.fillResults.push({
                    test: test.desc,
                    fillValue: '0x' + test.value.toString(16),
                    changedCount: testArr.filter(v => v === test.value).length,
                    resultLength: testArr.length,
                    success: true
                });
            } catch (e) {
                this.fillResults.push({
                    test: test.desc,
                    error: e.message.slice(0, 40),
                    success: false
                });
            }
        }

        // ==========================================
        // ATAQUE 5: TypedArray copyWithin (mais perigoso)
        // ==========================================
        this.typedCopyResults = [];
        const typedCopyTests = [
            { target: -1000000, start: 0, end: this.TEST_SIZE },
            { target: 0, start: this.TEST_SIZE + 1000, end: this.TEST_SIZE + 2000 },
            { target: this.TEST_SIZE + 1000, start: 0, end: 5 },
        ];

        for (const test of typedCopyTests) {
            const testTyped = new Uint32Array([...this.targetTyped]);
            try {
                testTyped.copyWithin(test.target, test.start, test.end);
                this.typedCopyResults.push({
                    target: test.target,
                    start: test.start,
                    end: test.end,
                    result0: '0x' + testTyped[0].toString(16),
                    resultLen: testTyped.length,
                    success: true
                });
            } catch (e) {
                this.typedCopyResults.push({
                    target: test.target,
                    error: e.message.slice(0, 40),
                    success: false
                });
            }
        }

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.targetArray = null;
        this.spyArray = null;
        this.targetTyped = null;
    },

    customValidator: function(baseResults, afterResults) {
        // 1. Splice retornou mais elementos que o array original?
        if (this.spliceResults) {
            for (const r of this.spliceResults) {
                if (r.success && r.removedLength > this.TEST_SIZE) {
                    return {
                        anomaly: true,
                        reason: `💥 SPLICE OOB: splice removeu ${r.removedLength} elementos de array com ${this.TEST_SIZE} (${r.test})`
                    };
                }
                if (r.success && r.resultLength > this.TEST_SIZE) {
                    return {
                        anomaly: true,
                        reason: `🏆 SPLICE OVERFLOW: array cresceu para ${r.resultLength} elementos (${r.test})`
                    };
                }
            }
        }

        // 2. Slice retornou mais elementos que o original?
        if (this.sliceResults) {
            for (const r of this.sliceResults) {
                if (r.success && r.sliceLength > this.TEST_SIZE) {
                    return {
                        anomaly: true,
                        reason: `💥 SLICE OOB: slice retornou ${r.sliceLength} elementos (${r.test})`
                    };
                }
            }
        }

        // 3. Fill alterou spy array?
        if (this.fillResults) {
            for (const r of this.fillResults) {
                if (r.success && r.changedCount > this.TEST_SIZE) {
                    return {
                        anomaly: true,
                        reason: `💥 FILL OVERFLOW: fill alterou ${r.changedCount} posições em array de ${this.TEST_SIZE}`
                    };
                }
            }
        }

        // 4. Spy array corrompido?
        if (afterResults[2] !== 0xBBBB0000 && afterResults[2] !== -1) {
            return {
                anomaly: true,
                reason: `💥 SPY CORRUPTION: Spy array alterado via operação de array! 0xBBBB0000 -> 0x${afterResults[2]?.toString(16)}`
            };
        }

        return { anomaly: false, reason: '' };
    }
};
