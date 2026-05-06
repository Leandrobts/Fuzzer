/**
 * TEST: Deep Recursion Attack
 * Explora recursão profunda para causar stack exhaustion no interpretador C++
 * SEM JIT: Interpretador tem stack limitada, recursão pode causar comportamento indefinido
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
        this.recursionResults = [];
        this.oobDuringRecursion = false;
    },

    probe: [
        function(scenario) {
            return scenario.stackExhausted ? 1 : 0;
        },
        function(scenario) {
            return scenario.maxDepthReached;
        },
        function(scenario) {
            return scenario.oobDuringRecursion ? 1 : 0;
        }
    ],

    trigger: function() {
        this.maxDepthReached = 0;
        this.stackExhausted = false;
        this.recursionResults = [];
        this.oobDuringRecursion = false;

        // ==========================================
        // TESTE 1: Recursão infinita estruturada
        // ==========================================
        const recursiveFunc = (depth, state) => {
            this.maxDepthReached = Math.max(this.maxDepthReached, depth);
            
            if (depth > 100000) {
                this.stackExhausted = true;
                return state;
            }
            
            // Cria objetos complexos durante recursão
            const obj = {
                depth: depth,
                array: new Uint32Array(16),
                nested: null
            };
            
            // Preenche array com dados baseados na profundidade
            for (let i = 0; i < obj.array.length; i++) {
                obj.array[i] = depth + i;
            }
            
            // Tenta acessar OOB em profundidades específicas
            if (depth > 1000 && depth % 500 === 0) {
                try {
                    const oobVal = obj.array[depth % 20 + 16]; // Posição OOB
                    if (oobVal !== undefined && oobVal !== 0) {
                        this.oobDuringRecursion = true;
                        this.recursionResults.push({
                            depth: depth,
                            oobValue: '0x' + oobVal.toString(16)
                        });
                    }
                } catch (e) {}
            }
            
            // Recursão com tail call-like pattern
            if (depth % 3 === 0) {
                return recursiveFunc(depth + 1, { ...state, mod3: true });
            } else if (depth % 3 === 1) {
                return recursiveFunc(depth + 2, { ...state, mod3: false });
            } else {
                return recursiveFunc(depth + 1, state);
            }
        };

        try {
            recursiveFunc(0, {});
        } catch (e) {
            this.stackExhausted = true;
            this.recursionResults.push({
                type: 'recursive_func',
                maxDepth: this.maxDepthReached,
                error: e.message
            });
        }

        // ==========================================
        // TESTE 2: Recursão mútua (função A chama B chama A)
        // ==========================================
        let mutualDepth = 0;
        
        const funcA = (depth) => {
            mutualDepth = Math.max(mutualDepth, depth);
            if (depth > 50000) return;
            
            // Aloca buffer a cada chamada
            const buf = new ArrayBuffer(64);
            const view = new Uint32Array(buf);
            view.fill(depth);
            
            return funcB(depth + 1);
        };
        
        const funcB = (depth) => {
            mutualDepth = Math.max(mutualDepth, depth);
            if (depth > 50000) return;
            
            return funcA(depth + 1);
        };

        try {
            funcA(0);
        } catch (e) {
            this.stackExhausted = true;
            this.recursionResults.push({
                type: 'mutual_recursion',
                maxDepth: mutualDepth,
                error: e.message
            });
        }

        // ==========================================
        // TESTE 3: Recursão via getters (implícita)
        // ==========================================
        let getterDepth = 0;
        const getterObj = {};
        
        try {
            Object.defineProperty(getterObj, 'recurse', {
                get: function() {
                    getterDepth++;
                    if (getterDepth > 10000) {
                        throw new Error('max_getter_depth');
                    }
                    // Auto-referência que causa recursão infinita
                    return this.recurse;
                }
            });
            
            // Tenta acessar (vai causar recursão infinita via getter)
            const val = getterObj.recurse;
            
        } catch (e) {
            this.stackExhausted = true;
            this.recursionResults.push({
                type: 'getter_recursion',
                maxDepth: getterDepth,
                error: e.message
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
                    if (proxyDepth > 10000) {
                        throw new Error('max_proxy_depth');
                    }
                    // Retorna o próprio proxy (recursão)
                    return target;
                }
            };
            
            const proxyObj = new Proxy({}, proxyHandler);
            let val = proxyObj;
            
            // Acessa em cadeia (cada .x dispara getter)
            for (let i = 0; i < 20000; i++) {
                val = val.x;
            }
            
        } catch (e) {
            this.stackExhausted = true;
            this.recursionResults.push({
                type: 'proxy_recursion',
                maxDepth: proxyDepth,
                error: e.message
            });
        }

        // ==========================================
        // TESTE 5: Recursão via valueOf/toString
        // ==========================================
        let toStringDepth = 0;
        
        const toStringBomb = {
            toString: function() {
                toStringDepth++;
                if (toStringDepth > 10000) {
                    throw new Error('max_toString');
                }
                return this; // Retorna a si mesmo
            },
            valueOf: function() {
                toStringDepth++;
                if (toStringDepth > 10000) {
                    throw new Error('max_valueOf');
                }
                return this;
            }
        };

        try {
            // Força coerção (causa recursão toString/valueOf)
            const coerced = String(toStringBomb) + Number(toStringBomb);
        } catch (e) {
            this.stackExhausted = true;
            this.recursionResults.push({
                type: 'tostring_recursion',
                maxDepth: toStringDepth,
                error: e.message
            });
        }

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.recursionResults = null;
    },

    customValidator: function(baseResults, afterResults) {
        if (this.oobDuringRecursion) {
            return {
                anomaly: true,
                reason: `💥💥💥 OOB DURING RECURSION: Acesso OOB detectado durante recursão profunda (depth=${this.maxDepthReached})!\n` +
                       `Dados: ${JSON.stringify(this.recursionResults?.filter(r => r.oobValue), null, 2)}`
            };
        }

        if (this.stackExhausted && this.maxDepthReached < 500) {
            return {
                anomaly: true,
                reason: `💥 PREMATURE STACK EXHAUSTION: Stack exauriu com apenas ${this.maxDepthReached} de profundidade! Stack muito limitada.`
            };
        }

        if (this.stackExhausted) {
            const depths = this.recursionResults?.map(r => `${r.type}:${r.maxDepth}`).join(', ');
            return {
                anomaly: true,
                reason: `🏆 STACK EXHAUSTION: ${this.recursionResults?.length} técnicas exauriram a stack.\nProfundidades: ${depths}`
            };
        }

        return { anomaly: false, reason: '' };
    }
};
