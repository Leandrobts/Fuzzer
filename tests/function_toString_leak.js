/**
 * TEST: Function.toString() Info Leak
 * Tenta vazar informações via Function.prototype.toString
 * PS4 13.50: Funções nativas podem vazar endereços
 */

export const testFunctionToStringLeak = {
    id: 'FUNCTION_TOSTRING_LEAK',
    name: 'Function.toString() Leak',
    risk: 'MEDIUM',
    category: 'JIT',
    description: 'Tenta vazar ponteiros/endereços via toString() de funções nativas',
    ps4Compatible: true,

    setup: function() {
        // Funções nativas para inspecionar
        this.nativeFunctions = [
            Math.random,
            Array.prototype.push,
            String.prototype.indexOf,
            JSON.parse,
            Function.prototype.bind,
            Object.create,
            RegExp.prototype.exec,
            Date.now,
            ArrayBuffer.prototype.slice,
            DataView.prototype.getUint32,
            Uint32Array.prototype.fill,
        ];

        // Funções com bind (podem revelar endereços)
        this.boundFunctions = [];
        for (const fn of this.nativeFunctions) {
            try {
                const bound = fn.bind(null);
                this.boundFunctions.push({
                    original: fn.name || 'anonymous',
                    bound: bound
                });
            } catch (e) {}
        }

        // Funções criadas dinamicamente
        this.dynamicFunctions = [];
        for (let i = 0; i < 10; i++) {
            const code = `return ${i} + arguments[0];`;
            try {
                const fn = new Function('x', code);
                this.dynamicFunctions.push(fn);
            } catch (e) {}
        }

        this.leakedAddresses = [];
        this.leakedPatterns = [];
    },

    probe: [
        function(scenario) {
            return scenario.nativeFunctions.length;
        },
        function(scenario) {
            try {
                const str = scenario.nativeFunctions[0].toString();
                return str.length;
            } catch (e) { return -1; }
        },
        function(scenario) {
            return scenario.leakedAddresses.length;
        }
    ],

    trigger: function() {
        this.leakedAddresses = [];
        this.leakedPatterns = [];

        // Ataque 1: toString() de funções nativas
        for (const fn of this.nativeFunctions) {
            try {
                const str = fn.toString();
                // Procura por padrões de endereço
                const addressPatterns = [
                    /0x[0-9a-fA-F]{8,16}/g,     // Endereços hex
                    /@\s*0x[0-9a-fA-F]+/g,       // @ 0x... (formato V8)
                    /at 0x[0-9a-fA-F]+/g,         // at 0x... (formato JSC)
                    /\[native code\]/g,            // Marcador nativo
                    /\(0x[0-9a-fA-F]+\)/g,        // (0x...)
                ];

                for (const pattern of addressPatterns) {
                    const matches = str.match(pattern);
                    if (matches) {
                        this.leakedAddresses.push(...matches);
                    }
                }

                // Verifica comprimento anormal (pode indicar vazamento)
                if (str.length > 200) {
                    this.leakedPatterns.push({
                        function: fn.name || 'anonymous',
                        length: str.length,
                        preview: str.slice(0, 100)
                    });
                }
            } catch (e) {}
        }

        // Ataque 2: Function.prototype.toString.call em objetos não-função
        const nonFunctions = [
            {}, [], new Date(), /regex/, 
            new Uint32Array(4), new ArrayBuffer(8),
            Symbol('test'), 42, 'string', true
        ];

        for (const obj of nonFunctions) {
            try {
                const str = Function.prototype.toString.call(obj);
                if (str && str.length > 0 && str !== '[object Object]') {
                    this.leakedPatterns.push({
                        type: typeof obj,
                        toString: str.slice(0, 100)
                    });
                }
            } catch (e) {}
        }

        // Ataque 3: toSource() se disponível (SpiderMonkey/Firefox)
        for (const fn of this.nativeFunctions) {
            try {
                if (typeof fn.toSource === 'function') {
                    const src = fn.toSource();
                    const hexMatches = src.match(/0x[0-9a-fA-F]+/g);
                    if (hexMatches) {
                        this.leakedAddresses.push(...hexMatches);
                    }
                }
            } catch (e) {}
        }

        // Ataque 4: Funções dinâmicas podem vazar closures
        for (const fn of this.dynamicFunctions) {
            try {
                const str = fn.toString();
                // Procura por variáveis capturadas
                if (str.includes('arguments') || str.includes('closure')) {
                    this.leakedPatterns.push({
                        type: 'dynamic',
                        containsClosure: true,
                        preview: str.slice(0, 100)
                    });
                }
            } catch (e) {}
        }

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.nativeFunctions = null;
        this.boundFunctions = null;
        this.dynamicFunctions = null;
    },

    customValidator: function(baseResults, afterResults) {
        if (this.leakedAddresses.length > 0) {
            const unique = [...new Set(this.leakedAddresses)];
            return {
                anomaly: true,
                reason: `💥 ADDRESS LEAK: ${unique.length} endereços vazados via toString(): ${unique.slice(0, 5).join(', ')}`
            };
        }

        if (this.leakedPatterns.length > 0) {
            const suspicious = this.leakedPatterns.filter(p => p.length > 200 || p.containsClosure);
            if (suspicious.length > 0) {
                return {
                    anomaly: true,
                    reason: `🏆 INFO LEAK: ${suspicious.length} padrões suspeitos em toString(): ${JSON.stringify(suspicious.slice(0, 3))}`
                };
            }
        }

        return { anomaly: false, reason: '' };
    }
};
