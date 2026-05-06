/**
 * TEST: Regex Catastrophic Backtracking (CORRIGIDO)
 * Executa regex maliciosas em Web Worker para não travar a UI
 * SEM JIT: Engine de regex C++ é o alvo
 * PS4 13.50: Worker=true, MessageChannel=true
 */

export const testRegexCatastrophic = {
    id: 'REGEX_CATASTROPHIC',
    name: '💀 Regex Catastrophic',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'Regex maliciosa em Worker para detectar backtracking sem travar UI',
    ps4Compatible: true,

    setup: function() {
        this.RESULT_TIMEOUT = 3000; // 3 segundos máximo por teste
        
        // Padrões ReDoS (executados em Worker)
        this.catastrophicPatterns = [
            { regex: '(a+)+b', name: 'nested_quantifier', input: 'a'.repeat(30) + '!' },
            { regex: '([a-zA-Z]+)*b', name: 'group_star', input: 'a'.repeat(50) + '!' },
            { regex: '(a|aa)+b', name: 'alternation_nested', input: 'a'.repeat(25) + '!' },
            { regex: '(a|a?)+b', name: 'optional_nested', input: 'a'.repeat(25) + '!' },
            { regex: '(a+){10}b', name: 'fixed_repeat_nested', input: 'a'.repeat(100) + '!' },
            { regex: '(.*a){10}', name: 'greedy_repeat', input: 'a'.repeat(20) + '!' },
        ];

        // Padrões que testam limites do engine
        this.engineStressPatterns = [
            { regex: '(([a-z])+)+$', name: 'email_like', input: 'a'.repeat(30) + '@' },
            { regex: '(\\w+)+$', name: 'word_boundary', input: 'a'.repeat(40) + '!' },
        ];

        this.workerResults = [];
        this.worker = null;
        this.testTimeout = null;
        this.backtrackingDetected = false;
        this.engineCrashDetected = false;
        this.workerCode = `
            self.onmessage = function(e) {
                const { regexStr, flags, input, testId } = e.data;
                const startTime = performance.now();
                
                try {
                    const regex = new RegExp(regexStr, flags || '');
                    const result = regex.test(input);
                    const elapsed = performance.now() - startTime;
                    
                    self.postMessage({
                        testId: testId,
                        success: true,
                        result: result,
                        elapsed: elapsed,
                        inputLength: input.length
                    });
                } catch (err) {
                    self.postMessage({
                        testId: testId,
                        success: false,
                        error: err.message,
                        elapsed: performance.now() - startTime
                    });
                }
            };
        `;
    },

    probe: [
        function(scenario) {
            return scenario.backtrackingDetected ? 1 : 0;
        },
        function(scenario) {
            return scenario.engineCrashDetected ? 1 : 0;
        },
        function(scenario) {
            return scenario.workerResults?.filter(r => r.elapsed > 1000).length ?? 0;
        },
        function(scenario) {
            return scenario.workerResults?.length ?? 0;
        }
    ],

    trigger: async function() {
        this.workerResults = [];
        this.backtrackingDetected = false;
        this.engineCrashDetected = false;

        // Cria worker
        if (typeof Worker === 'undefined') {
            // Fallback: executa inline com timeout manual
            await this.runInlineRegexTests();
            return;
        }

        try {
            const blob = new Blob([this.workerCode], { type: 'application/javascript' });
            this.worker = new Worker(URL.createObjectURL(blob));
        } catch (e) {
            await this.runInlineRegexTests();
            return;
        }

        // Executa testes via worker
        const allPatterns = [...this.catastrophicPatterns, ...this.engineStressPatterns];
        
        for (let i = 0; i < allPatterns.length; i++) {
            const pattern = allPatterns[i];
            
            try {
                const result = await this.runRegexInWorker(this.worker, {
                    regexStr: pattern.regex,
                    flags: '',
                    input: pattern.input,
                    testId: i
                }, this.RESULT_TIMEOUT);

                this.workerResults.push({
                    name: pattern.name,
                    ...result
                });

                // Detecta backtracking (>1s para input <100 chars)
                if (result.elapsed > 1000 && pattern.input.length < 100) {
                    this.backtrackingDetected = true;
                }

                // Detecta possível crash/overflow
                if (result.error && (
                    result.error.includes('stack') ||
                    result.error.includes('overflow') ||
                    result.error.includes('recursion') ||
                    result.error.includes('too much')
                )) {
                    this.engineCrashDetected = true;
                }

                if (result.elapsed > this.RESULT_TIMEOUT) {
                    this.backtrackingDetected = true;
                }

            } catch (e) {
                this.workerResults.push({
                    name: pattern.name,
                    success: false,
                    error: e.message,
                    elapsed: this.RESULT_TIMEOUT
                });
                
                if (e.message.includes('timeout')) {
                    this.backtrackingDetected = true;
                }
            }
        }

        // Limpa worker
        try { this.worker.terminate(); } catch (e) {}
        this.worker = null;
    },

    runRegexInWorker: function(worker, data, timeout) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('timeout'));
            }, timeout);

            worker.onmessage = (e) => {
                clearTimeout(timeoutId);
                resolve(e.data);
            };

            worker.onerror = (e) => {
                clearTimeout(timeoutId);
                reject(new Error('worker_error: ' + e.message));
            };

            try {
                worker.postMessage(data);
            } catch (e) {
                clearTimeout(timeoutId);
                reject(e);
            }
        });
    },

    runInlineRegexTests: async function() {
        // Fallback sem worker (com timeout manual)
        const allPatterns = [...this.catastrophicPatterns, ...this.engineStressPatterns];
        
        for (let i = 0; i < allPatterns.length; i++) {
            const pattern = allPatterns[i];
            
            try {
                const startTime = performance.now();
                let result = null;
                let error = null;
                let timedOut = false;

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('timeout')), this.RESULT_TIMEOUT);
                });

                const regexPromise = new Promise((resolve) => {
                    try {
                        const regex = new RegExp(pattern.regex);
                        resolve(regex.test(pattern.input));
                    } catch (e) {
                        resolve({ error: e.message });
                    }
                });

                try {
                    result = await Promise.race([regexPromise, timeoutPromise]);
                } catch (e) {
                    timedOut = true;
                    error = e.message;
                }

                const elapsed = performance.now() - startTime;

                this.workerResults.push({
                    name: pattern.name,
                    success: !timedOut,
                    result: result,
                    error: error,
                    elapsed: elapsed,
                    inputLength: pattern.input.length
                });

                if (elapsed > 1000 && pattern.input.length < 100) {
                    this.backtrackingDetected = true;
                }

            } catch (e) {
                this.workerResults.push({
                    name: pattern.name,
                    success: false,
                    error: e.message,
                    elapsed: this.RESULT_TIMEOUT
                });
            }
        }
    },

    cleanup: function() {
        try { this.worker?.terminate(); } catch (e) {}
        this.worker = null;
        this.workerResults = null;
    },

    customValidator: function(baseResults, afterResults) {
        // Engine crash/overflow
        if (this.engineCrashDetected) {
            const crashEntry = this.workerResults?.find(r => r.error && (
                r.error.includes('stack') || r.error.includes('overflow')
            ));
            return {
                anomaly: true,
                reason: `💥💥💥 REGEX ENGINE CRASH: O engine de regex C++ crashou/estourou stack!\n` +
                       `Padrão: ${crashEntry?.name}, Erro: ${crashEntry?.error}`
            };
        }

        // Backtracking exponencial confirmado (ReDoS)
        if (this.backtrackingDetected && afterResults[2] >= 3) {
            const slowOnes = this.workerResults?.filter(r => r.elapsed > 1000) || [];
            return {
                anomaly: true,
                reason: `💥 ReDoS CONFIRMADO: ${slowOnes.length} padrões causaram backtracking >1s!\n` +
                       `Engine vulnerável a DoS via regex. Padrões: ${slowOnes.map(r => r.name).join(', ')}`
            };
        }

        // Timeouts detectados
        const timeouts = this.workerResults?.filter(r => r.elapsed >= this.RESULT_TIMEOUT) || [];
        if (timeouts.length > 0) {
            return {
                anomaly: true,
                reason: `⏱️ REGEX TIMEOUT: ${timeouts.length} padrões excederam ${this.RESULT_TIMEOUT}ms. Possível ReDoS.`
            };
        }

        return { anomaly: false, reason: '' };
    }
};
