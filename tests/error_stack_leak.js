/**
 * TEST: Error.stack Info Leak
 * Tenta vazar informações via Error().stack
 * PS4 13.50: Stack traces podem conter URLs/linhas internas
 */

export const testErrorStackLeak = {
    id: 'ERROR_STACK_LEAK',
    name: 'Error.stack Info Leak',
    risk: 'MEDIUM',
    category: 'JIT',
    description: 'Tenta vazar paths/endereços via Error.stack e stack traces',
    ps4Compatible: true,

    setup: function() {
        this.stackResults = [];
        this.errorTypes = [
            Error, TypeError, RangeError, ReferenceError,
            SyntaxError, URIError, EvalError
        ];
        this.leakedPaths = [];
        this.leakedLineNumbers = [];
    },

    probe: [
        function(scenario) {
            try {
                return new Error().stack?.length ?? 0;
            } catch (e) { return -1; }
        },
        function(scenario) {
            return scenario.leakedPaths.length;
        },
        function(scenario) {
            return scenario.leakedLineNumbers.length;
        }
    ],

    trigger: function() {
        this.leakedPaths = [];
        this.leakedLineNumbers = [];
        this.stackResults = [];

        // Ataque 1: Captura stack de diferentes tipos de erro
        for (const ErrorType of this.errorTypes) {
            try {
                const err = new ErrorType('fuzzer_test');
                const stack = err.stack || '';

                this.stackResults.push({
                    type: ErrorType.name,
                    stackLength: stack.length,
                    hasLineNumbers: /\d+:\d+/.test(stack),
                    hasFilePaths: /\/.*\.js/.test(stack) || /\.js:\d+/.test(stack),
                    preview: stack.slice(0, 200)
                });

                // Extrai paths
                const pathMatches = stack.match(/\/[^\s:)]+\.js/g);
                if (pathMatches) {
                    this.leakedPaths.push(...pathMatches);
                }

                // Extrai números de linha
                const lineMatches = stack.match(/:\d+:\d+/g);
                if (lineMatches) {
                    this.leakedLineNumbers.push(...lineMatches);
                }
            } catch (e) {}
        }

        // Ataque 2: Erro em diferentes contextos
        const contexts = [
            () => { try { throw new Error('arrow'); } catch(e) { return e.stack; } },
            function() { try { throw new Error('regular'); } catch(e) { return e.stack; } },
            async () => { try { throw new Error('async'); } catch(e) { return e.stack; } },
        ];

        for (const ctx of contexts) {
            try {
                const stack = ctx();
                if (stack) {
                    this.stackResults.push({
                        context: ctx.toString().slice(0, 30),
                        stack: stack.slice(0, 200)
                    });
                }
            } catch (e) {}
        }

        // Ataque 3: Erro dentro de eval (pode revelar paths internos)
        try {
            const evalCode = `
                try {
                    throw new Error('eval_test');
                } catch(e) {
                    return e.stack;
                }
            `;
            const stack = eval(evalCode);
            if (stack) {
                this.stackResults.push({
                    context: 'eval',
                    stack: stack.slice(0, 200)
                });

                const pathMatches = stack.match(/\/[^\s:)]+\.js/g);
                if (pathMatches) {
                    this.leakedPaths.push(...pathMatches);
                }
            }
        } catch (e) {}

        // Ataque 4: Error.captureStackTrace (V8)
        const captureObj = {};
        try {
            if (typeof Error.captureStackTrace === 'function') {
                Error.captureStackTrace(captureObj);
                const stack = captureObj.stack || '';
                this.stackResults.push({
                    context: 'captureStackTrace',
                    stack: stack.slice(0, 200)
                });
            }
        } catch (e) {}

        // Ataque 5: Stack via console.trace (se disponível)
        try {
            if (typeof console.trace === 'function') {
                // Não podemos capturar a saída, mas podemos verificar se existe
                this.stackResults.push({
                    context: 'console.trace',
                    available: true
                });
            }
        } catch (e) {}

        // Ataque 6: Performance.mark com detalhes
        try {
            if (typeof performance.mark === 'function') {
                performance.mark('fuzzer_mark_start');
                performance.mark('fuzzer_mark_end');
                const measure = performance.measure('fuzzer_test', 'fuzzer_mark_start', 'fuzzer_mark_end');
                if (measure) {
                    this.stackResults.push({
                        context: 'performance',
                        duration: measure.duration
                    });
                }
                performance.clearMarks();
                performance.clearMeasures();
            }
        } catch (e) {}

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.stackResults = null;
    },

    customValidator: function(baseResults, afterResults) {
        // Paths internos vazados
        if (this.leakedPaths.length > 0) {
            const unique = [...new Set(this.leakedPaths)];
            const internalPaths = unique.filter(p => 
                p.includes('webkit') || 
                p.includes('safari') || 
                p.includes('jsc') ||
                p.includes('javascriptcore') ||
                p.includes('/usr/') ||
                p.includes('/system/') ||
                p.includes('ps4')
            );

            if (internalPaths.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 INTERNAL PATH LEAK: ${internalPaths.length} paths internos vazados: ${internalPaths.slice(0, 3).join(', ')}`
                };
            }

            if (unique.length > 5) {
                return {
                    anomaly: true,
                    reason: `🏆 PATH LEAK: ${unique.length} paths únicos vazados via stack trace`
                };
            }
        }

        // Linhas internas (podem revelar estrutura do engine)
        if (this.leakedLineNumbers.length > 20) {
            return {
                anomaly: true,
                reason: `🏆 LINE NUMBER LEAK: ${this.leakedLineNumbers.length} números de linha vazados`
            };
        }

        return { anomaly: false, reason: '' };
    }
};
