/**
 * TEST: Iterator Poisoning Attack
 * Sobrescreve Symbol.iterator para causar comportamentos maliciosos
 * PS4 13.50: Symbol=true, iterators nativos podem ser envenenados
 */

export const testIteratorPoisoning = {
    id: 'ITERATOR_POISONING',
    name: 'Iterator Poisoning',
    risk: 'HIGH',
    category: 'PROTO',
    description: 'Envenena iteradores nativos para causar type confusion',
    ps4Compatible: true,

    setup: function() {
        this.originalIterator = Uint32Array.prototype[Symbol.iterator];
        this.iteratorCallCount = 0;
        this.iteratorResults = [];
        this.oobDetected = false;
    },

    probe: [
        function(scenario) {
            return scenario.oobDetected ? 1 : 0;
        },
        function(scenario) {
            return scenario.iteratorCallCount;
        },
        function(scenario) {
            // Verifica se iterator original foi restaurado
            return Uint32Array.prototype[Symbol.iterator] === scenario.originalIterator ? 'RESTORED' : 'POISONED';
        }
    ],

    trigger: function() {
        this.iteratorCallCount = 0;
        this.iteratorResults = [];
        this.oobDetected = false;

        // ==========================================
        // ATAQUE 1: Iterator que retorna valores OOB
        // ==========================================
        const arr1 = new Uint32Array(16);
        for (let i = 0; i < 16; i++) {
            arr1[i] = 0xAAAAAAAA;
        }

        try {
            Uint32Array.prototype[Symbol.iterator] = function*() {
                // Ignora o tamanho real e itera MUITO além
                for (let i = 0; i < 1000; i++) {
                    this.iteratorCallCount = (this.iteratorCallCount || 0) + 1;
                    if (i < this.length) {
                        yield this[i];
                    } else {
                        // Tenta acessar OOB
                        try {
                            const val = this[i];
                            if (val !== undefined) {
                                yield val;
                            }
                        } catch (e) {
                            break;
                        }
                    }
                }
            };

            // Usa o iterador envenenado
            const values = [];
            for (const val of arr1) {
                values.push(val);
                if (values.length > 20) break; // Segurança
            }

            this.iteratorCallCount = values.length;
            
            if (values.length > 16) {
                this.oobDetected = true;
                this.iteratorResults.push({
                    test: 'ITERATOR_OOB',
                    valuesCount: values.length,
                    extraValues: values.slice(16, 20).map(v => '0x' + v.toString(16))
                });
            }
        } catch (e) {
            this.iteratorResults.push({
                test: 'ITERATOR_ERROR',
                error: e.message
            });
        } finally {
            Uint32Array.prototype[Symbol.iterator] = this.originalIterator;
        }

        // ==========================================
        // ATAQUE 2: Iterator que alterna tipos
        // ==========================================
        const arr2 = new Float64Array(16);
        for (let i = 0; i < 16; i++) {
            arr2[i] = i * 1.5;
        }

        try {
            let typeToggle = false;
            Uint32Array.prototype[Symbol.iterator] = function*() {
                for (let i = 0; i < this.length * 2; i++) {
                    typeToggle = !typeToggle;
                    if (typeToggle) {
                        yield 42; // Number
                    } else {
                        yield {}; // Object (type confusion!)
                    }
                }
            };

            const arr3 = new Uint32Array(4);
            arr3.fill(0xBB);

            const values = [];
            for (const val of arr3) {
                values.push({ value: val, type: typeof val });
                if (values.length > 10) break;
            }

            const types = [...new Set(values.map(v => v.type))];
            if (types.length > 1) {
                this.iteratorResults.push({
                    test: 'ITERATOR_TYPE_CONFUSION',
                    types: types,
                    sample: values.slice(0, 5)
                });
            }

        } catch (e) {
            this.iteratorResults.push({
                test: 'TYPE_CONFUSION_ERROR',
                error: e.message
            });
        } finally {
            Uint32Array.prototype[Symbol.iterator] = this.originalIterator;
        }

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        // Garante restauração
        Uint32Array.prototype[Symbol.iterator] = this.originalIterator;
    },

    customValidator: function(baseResults, afterResults) {
        // Verifica se iterator ficou envenenado
        if (afterResults[2] === 'POISONED') {
            return {
                anomaly: true,
                reason: '⚠️ ITERATOR PERSISTENTE: Symbol.iterator continua envenenado após cleanup!'
            };
        }

        // OOB via iterator
        if (this.oobDetected) {
            return {
                anomaly: true,
                reason: `💥 ITERATOR OOB: Iterator envenenado retornou valores além do buffer!\n${JSON.stringify(this.iteratorResults, null, 2)}`
            };
        }

        // Type confusion via iterator
        const typeConf = this.iteratorResults?.filter(r => r.test === 'ITERATOR_TYPE_CONFUSION');
        if (typeConf && typeConf.length > 0) {
            return {
                anomaly: true,
                reason: `🏆 ITERATOR TYPE CONFUSION: Iterator retornou múltiplos tipos!\n${JSON.stringify(typeConf, null, 2)}`
            };
        }

        return { anomaly: false, reason: '' };
    }
};
