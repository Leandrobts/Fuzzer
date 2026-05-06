/**
 * TEST: Regex Catastrophic Backtracking
 * Explora o engine de RegExp (C++) com padrões que causam backtracking exponencial
 * SEM JIT: O interpretador de regex é vulnerável a ReDoS e potencial buffer overflow
 */

export const testRegexCatastrophic = {
    id: 'REGEX_CATASTROPHIC',
    name: '💀 Regex Catastrophic',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'Regex maliciosa para causar backtracking exponencial no engine C++',
    ps4Compatible: true,

    setup: function() {
        // Padrões conhecidos de ReDoS
        this.catastrophicPatterns = [
            { regex: /(a+)+b/, name: 'nested_quantifier' },
            { regex: /([a-zA-Z]+)*b/, name: 'group_star' },
            { regex: /(a|aa)+b/, name: 'alternation_nested' },
            { regex: /(a|a?)+b/, name: 'optional_nested' },
            { regex: /(.*a){10}/, name: 'greedy_repeat' },
            { regex: /(([a-z])+)+$/, name: 'email_like' },
            { regex: /(a+){10}b/, name: 'fixed_repeat_nested' },
            { regex: /\\b([a-zA-Z0-9])([a-zA-Z0-9])([a-zA-Z0-9])([a-zA-Z0-9])([a-zA-Z0-9])([a-zA-Z0-9])([a-zA-Z0-9])([a-zA-Z0-9])([a-zA-Z0-9])([a-zA-Z0-9])\\b.*\\1\\2\\3\\4\\5\\6\\7\\8\\9\\0/, name: 'backreference_bomb' },
        ];

        // Strings de entrada maliciosas
        this.maliciousInputs = [
            'a'.repeat(30) + '!',
            'a'.repeat(100) + '!',
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaa!',
            'a'.repeat(50) + 'b'.repeat(50),
        ];

        this.timingResults = [];
        this.crashDetected = false;
        this.backtrackLimitHit = false;
    },

    probe: [
        function(scenario) {
            return scenario.crashDetected ? 1 : 0;
        },
        function(scenario) {
            return scenario.backtrackLimitHit ? 1 : 0;
        },
        function(scenario) {
            return scenario.timingResults.length;
        }
    ],

    trigger: function() {
        this.timingResults = [];
        this.crashDetected = false;
        this.backtrackLimitHit = false;

        const TIMEOUT_MS = 5000; // 5 segundos máximo por regex

        for (const pattern of this.catastrophicPatterns) {
            for (const input of this.maliciousInputs) {
                const startTime = performance.now();
                let result = null;
                let error = null;
                let timedOut = false;

                try {
                    // Timeout manual (não bloqueante o suficiente, mas ajuda)
                    const timeoutId = setTimeout(() => {
                        timedOut = true;
                    }, TIMEOUT_MS);

                    result = pattern.regex.test(input);
                    clearTimeout(timeoutId);

                } catch (e) {
                    error = e.message;
                    // Se o engine crashou ou lançou erro interno
                    if (e.message.includes('stack') || 
                        e.message.includes('recursion') ||
                        e.message.includes('overflow') ||
                        e.message.includes('too much') ||
                        e.message.includes('backtrack')) {
                        this.backtrackLimitHit = true;
                    }
                }

                const elapsed = performance.now() - startTime;

                this.timingResults.push({
                    pattern: pattern.name,
                    inputLength: input.length,
                    elapsed: elapsed,
                    result: result,
                    timedOut: timedOut || elapsed > TIMEOUT_MS,
                    error: error
                });

                // Detecta comportamentos anômalos
                if (elapsed > 1000 && input.length < 100) {
                    // Regex simples levou >1s = backtracking exponencial
                    this.backtrackLimitHit = true;
                }

                if (elapsed > TIMEOUT_MS && input.length < 50) {
                    this.crashDetected = true;
                }

                if (error && error.includes('stack')) {
                    this.crashDetected = true;
                }
            }
        }

        // ==========================================
        // TESTE AVANÇADO: Regex com grupos de captura enormes
        // ==========================================
        try {
            // Cria regex com MUITOS grupos de captura
            let complexRegex = '(';
            for (let i = 0; i < 1000; i++) {
                complexRegex += 'a' + i + '|';
            }
            complexRegex += 'b)';
            
            const compiled = new RegExp(complexRegex);
            const testStr = 'a'.repeat(5000) + 'b';
            
            const start = performance.now();
            compiled.test(testStr);
            const elapsed = performance.now() - start;

            this.timingResults.push({
                pattern: 'massive_alternation',
                inputLength: testStr.length,
                elapsed: elapsed,
                success: true
            });

            if (elapsed > 3000) {
                this.backtrackLimitHit = true;
            }

        } catch (e) {
            this.timingResults.push({
                pattern: 'massive_alternation',
                error: e.message
            });
            if (e.message.includes('overflow') || e.message.includes('too many')) {
                this.crashDetected = true;
            }
        }

        // ==========================================
        // TESTE: Regex.exec() com lastIndex malicioso
        // ==========================================
        try {
            const stickyRegex = /a+/y;
            stickyRegex.lastIndex = 0x7FFFFFFF; // Valor enorme
            
            try {
                stickyRegex.exec('aaaa');
                this.timingResults.push({
                    pattern: 'sticky_lastindex',
                    lastIndex: 0x7FFFFFFF,
                    success: true
                });
            } catch (e) {
                this.timingResults.push({
                    pattern: 'sticky_lastindex',
                    error: e.message
                });
            }
        } catch (e) {}

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.timingResults = null;
    },

    customValidator: function(baseResults, afterResults) {
        // Crash/overflow detectado
        if (this.crashDetected) {
            const crashEntries = this.timingResults.filter(r => r.timedOut || (r.error && r.error.includes('stack')));
            return {
                anomaly: true,
                reason: `💥💥💥 REGEX CRASH/OVERFLOW: Engine de regex vulnerável a backtracking catastrófico!\n` +
                       `Entradas que causaram problema: ${JSON.stringify(crashEntries.slice(0, 3), null, 2)}`
            };
        }

        // Backtracking exponencial confirmado
        if (this.backtrackLimitHit) {
            const slowEntries = this.timingResults.filter(r => r.elapsed > 1000 && r.inputLength < 100);
            return {
                anomaly: true,
                reason: `💥 REGEX DoS: ${slowEntries.length} padrões causaram backtracking >1s com input <100 chars! ReDoS confirmado.\n` +
                       `Pior caso: ${slowEntries[0]?.pattern} - ${slowEntries[0]?.elapsed?.toFixed(0)}ms com ${slowEntries[0]?.inputLength} chars`
            };
        }

        // Timing anômalo
        const extreme = this.timingResults.filter(r => r.elapsed > 5000);
        if (extreme.length > 0) {
            return {
                anomaly: true,
                reason: `⏱️ REGEX TIMING SPIKE: ${extreme.length} regex levaram >5s! Engine pode estar vulnerável.`
            };
        }

        return { anomaly: false, reason: '' };
    }
};
