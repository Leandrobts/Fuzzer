/**
 * TEST: Deep Recursion Attack (CORRIGIDO)
 * Só alerta se: stack exhaustion prematura (<500 níveis) OU OOB durante recursão
 * Ignora profundidade normal (esperado atingir ~11000 níveis no PS4)
 */

export const testDeepRecursionAttack = {
    id: 'DEEP_RECURSION',
    name: '🔄 Deep Recursion',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'Recursão profunda para exaustão de stack e comportamento indefinido',
    ps4Compatible: true,

    setup: function() {
        this.maxDepthReached = 0;
        this.stackExhausted = false;
        this.prematureExhaustion = false;
        this.recursionResults = [];
        this.oobDuringRecursion = false;
        this.PREMATURE_THRESHOLD = 500; // Menos que isso é anormal
    },

    probe: [
        // Probe 0: Stack exauriu? (0=Não, 1=Sim profundo/esperado, 2=Sim prematuro/anormal)
        function(scenario) {
            if (scenario.prematureExhaustion) return 2;
            if (scenario.stackExhausted) return 1;
            return 0;
        },

        // Probe 1: OOB durante recursão? (0=Não, 1=Sim)
        function(scenario) {
            return scenario.oobDuringRecursion ? 1 : 0;
        },

        // Probe 2: Profundidade (normalizado: 0 = baseline consistente)
        function(scenario) {
            return 0; // Sempre 0 - evita falso positivo
        },

        // Probe 3: Número de técnicas que exauriram stack
        function(scenario) {
            return scenario.recursionResults?.length ?? 0;
        }
    ],

    trigger: function() {
        this.maxDepthReached = 0;
        this.stackExhausted = false;
        this.prematureExhaustion = false;
        this.recursionResults = [];
        this.oobDuringRecursion = false;

        // ==========================================
        // TESTE 1: Recursão simples profunda
        // ==========================================
        try {
            const recursiveFunc = (depth) => {
                this.maxDepthReached = Math.max(this.maxDepthReached, depth);
                
                if (depth > 50000) {
                    this.stackExhausted = true;
                    return depth;
                }
                
                // Aloca objetos durante recursão
                const obj = {
                    depth: depth,
                    array: new Uint32Array(16)
                };
                
                // Preenche array
                for (let i = 0; i < obj.array.length; i++) {
                    obj.array[i] = depth + i;
                }
                
                // Tenta OOB em profundidades específicas
                if (depth > 1000 && depth % 500 === 0) {
                    try {
                        const oobIdx = (depth % 20) + 16;
                        const oobVal = obj.array[oobIdx];
                        if (oobVal !== undefined && oobVal !== 0xAAAAAAAA && oobVal !== 0) {
                            this.oobDuringRecursion = true;
                            this.recursionResults.push({
                                type: 'recursive_func_oob',
                                depth: depth,
                                oobIndex: oobIdx,
                                oobValue: '0x' + oobVal.toString(16)
                            });
                        }
                    } catch (e) {}
                }
                
                return recursiveFunc(depth + 1);
            };

            const finalDepth = recursiveFunc(0);
            
            if (finalDepth && finalDepth > 40000) {
                this.stackExhausted = true;
            }
            
        } catch (e) {
            this.stackExhausted = true;
            if (this.maxDepthReached < this.PREMATURE_THRESHOLD) {
                this.prematureExhaustion = true;
            }
            this.recursionResults.push({
                type: 'recursive_func',
                maxDepth: this.maxDepthReached,
                error: e.message.slice(0, 50)
            });
        }

        // ==========================================
        // TESTE 2: Recursão mútua
        // ==========================================
        let mutualDepth = 0;
        
        const funcA = (depth) => {
            mutualDepth = Math.max(mutualDepth, depth);
            this.maxDepthReached = Math.max(this.maxDepthReached, depth);
            if (depth > 50000) return;
            return funcB(depth + 1);
        };
        
        const funcB = (depth) => {
            mutualDepth = Math.max(mutualDepth, depth);
            this.maxDepthReached = Math.max(this.maxDepthReached, depth);
            if (depth > 50000) return;
            return funcA(depth + 1);
        };

        try {
            funcA(0);
        } catch (e) {
            this.stackExhausted = true;
            if (mutualDepth < this.PREMATURE_THRESHOLD) {
                this.prematureExhaustion = true;
            }
            this.recursionResults.push({
                type: 'mutual_recursion',
                maxDepth: mutualDepth,
                error: e.message.slice(0, 50)
            });
        }

        // ==========================================
        // TESTE 3: Recursão via getter
        // ==========================================
        let getterDepth = 0;
        
        try {
            const getterObj = {};
            Object.defineProperty(getterObj, 'recurse', {
                get: function() {
                    getterDepth++;
                    this.maxDepthReached = Math.max(this.maxDepthReached, getterDepth);
                    if (getterDepth > 50000) {
                        throw new Error('max_getter_depth');
                    }
                    return this.recurse;
                }
            });
            
            const val = getterObj.recurse;
            
        } catch (e) {
            this.stackExhausted = true;
            if (getterDepth < this.PREMATURE_THRESHOLD) {
                this.prematureExhaustion = true;
            }
            this.recursionResults.push({
                type: 'getter_recursion',
                maxDepth: getterDepth,
                error: e.message.slice(0, 50)
            });
        }

        // ==========================================
        // TESTE 4: Recursão via Proxy
        // ==========================================
        let proxyDepth = 0;
        
        try {
            const proxyHandler = {
                get(target, prop) {
                    proxyDepth++;
                    this.maxDepthReached = Math.max(this.maxDepthReached, proxyDepth);
                    if (proxyDepth > 50000) {
                        throw new Error('max_proxy_depth');
                    }
                    return target;
                }
            };
            
            const proxyObj = new Proxy({}, proxyHandler);
            let val = proxyObj;
            
            for (let i = 0; i < 50000; i++) {
                val = val.x;
            }
            
        } catch (e) {
            this.stackExhausted = true;
            if (proxyDepth < this.PREMATURE_THRESHOLD) {
                this.prematureExhaustion = true;
            }
            this.recursionResults.push({
                type: 'proxy_recursion',
                maxDepth: proxyDepth,
                error: e.message.slice(0, 50)
            });
        }

        // ==========================================
        // TESTE 5: Recursão via toString/valueOf
        // ==========================================
        let toStringDepth = 0;
        
        const toStringBomb = {
            toString: function() {
                toStringDepth++;
                this.maxDepthReached = Math.max(this.maxDepthReached, toStringDepth);
                if (toStringDepth > 50000) {
                    throw new Error('max_toString');
                }
                return this;
            },
            valueOf: function() {
                toStringDepth++;
                this.maxDepthReached = Math.max(this.maxDepthReached, toStringDepth);
                if (toStringDepth > 50000) {
                    throw new Error('max_valueOf');
                }
                return this;
            }
        };

        try {
            const coerced = String(toStringBomb) + Number(toStringBomb);
        } catch (e) {
            this.stackExhausted = true;
            if (toStringDepth < this.PREMATURE_THRESHOLD) {
                this.prematureExhaustion = true;
            }
            this.recursionResults.push({
                type: 'tostring_recursion',
                maxDepth: toStringDepth,
                error: e.message.slice(0, 50)
            });
        }

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.recursionResults = null;
    },

    customValidator: function(baseResults, afterResults) {
        // ==========================================
        // ALERTA CRÍTICO: OOB durante recursão
        // ==========================================
        if (this.oobDuringRecursion) {
            const oobEntries = this.recursionResults?.filter(r => r.oobValue) || [];
            return {
                anomaly: true,
                reason: `💥💥💥 OOB DURING RECURSION: ${oobEntries.length} acessos OOB durante recursão!\n` +
                       `Profundidade máxima: ${this.maxDepthReached}\n` +
                       `Detalhes: ${JSON.stringify(oobEntries.slice(0, 5), null, 2)}`
            };
        }

        // ==========================================
        // ALERTA ALTO: Stack exhaustion prematura
        // ==========================================
        if (this.prematureExhaustion) {
            const prematEntries = this.recursionResults?.filter(r => 
                r.maxDepth < this.PREMATURE_THRESHOLD
            ) || [];
            
            return {
                anomaly: true,
                reason: `💥 STACK EXHAUSTION PREMATURA: Stack exauriu com apenas ${this.maxDepthReached} níveis!\n` +
                       `Esperado: >10000 níveis (PS4 tem stack generosa para JS)\n` +
                       `Técnicas afetadas: ${prematEntries.map(r => `${r.type}:${r.maxDepth}`).join(', ')}\n` +
                       `Possível corrupção de stack ou limite anormal do interpretador.`
            };
        }

        // ==========================================
        // INFO: Stack exhaustion em profundidade normal
        // ==========================================
        if (this.stackExhausted && this.maxDepthReached >= this.PREMATURE_THRESHOLD) {
            // Comportamento esperado - NÃO é anomalia
            // Apenas registra para informação
            console.log(`Deep Recursion: Stack exauriu em ${this.maxDepthReached} níveis (normal para PS4: >10000)`);
        }

        // ==========================================
        // INFO: Comportamento do engine
        // ==========================================
        if (this.maxDepthReached > 100000) {
            return {
                anomaly: true,
                reason: `🏆 EXTREME RECURSION: Atingiu ${this.maxDepthReached} níveis sem stack exhaustion! Stack extremamente profunda.`
            };
        }

        return { anomaly: false, reason: '' };
    }
};
