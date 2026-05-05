/**
 * MOD_MUTATOR.JS — Data Mutation Engine
 * Gera variações de tipos para confundir o JIT compiler
 */

export const Mutator = {
    /**
     * Tipos especiais para NaN-Boxing no JSC
     */
    JSC_TYPES: {
        DOUBLE: 'double',
        INT32: 'int32',
        UNDEFINED: 'undefined',
        NULL: 'null',
        BOOLEAN: 'boolean',
        EMPTY: 'empty',
        DELETED: 'deleted'
    },
    
    /**
     * Gera valores NaN-Boxing para confundir o compilador
     */
    nanBoxValues: function() {
        const values = [];
        
        // NaN codificado com payloads diferentes
        const nanBuf = new ArrayBuffer(8);
        const nanView = new Float64Array(nanBuf);
        const intView = new BigInt64Array(nanBuf);
        
        // Vários padrões NaN
        const patterns = [
            0x7FF8000000000001n, // NaN quieto + 1
            0x7FF80000DEADBEEFn, // NaN com assinatura
            0x7FF0000000000000n, // Infinito
            0xFFF0000000000000n, // -Infinito
            0x7FF8000000000000n, // NaN canônico
            0x0000000000000001n, // Subnormal
        ];
        
        for (const pattern of patterns) {
            intView[0] = pattern;
            values.push(nanView[0]);
        }
        
        return values;
    },
    
    /**
     * Gera inteiros que parecem ponteiros no PS4
     */
    pointerLikeValues: function() {
        const values = [];
        const base = 0x0000000800000000n; // Região típica de heap PS4
        
        for (let i = 0; i < 20; i++) {
            const offset = BigInt(i * 0x1000);
            const ptr = base + offset;
            
            // Converte para Number (perda de precisão intencional)
            const asNumber = Number(ptr & 0xFFFFFFFFFFFFn);
            if (!isNaN(asNumber) && isFinite(asNumber)) {
                values.push(asNumber);
            }
        }
        
        return values;
    },
    
    /**
     * Gera strings maliciosas para parsers
     */
    maliciousStrings: function() {
        return [
            // Strings que confundem parsers
            '\u0000\u0000\u0000\u0000',
            'constructor',
            '__proto__',
            'toString',
            'valueOf',
            Symbol('test').description || '',
            
            // Long strings para estouro de buffer
            'A'.repeat(10000),
            'B'.repeat(65536),
            
            // Caracteres especiais
            '\0',
            '\xFF'.repeat(100),
            '\uFFFF',
            '\\u0000',
            
            // Padrões regex complexos
            '(a+)+b',
            '((a+)+)+b',
            
            // UTF-16 malformado
            '\uD800\uDC00', // Surrogate pair válido
            '\uD800',       // Surrogate isolado
        ];
    },
    
    /**
     * Gera objetos com getters armadilhas
     */
    trapObjects: function() {
        const traps = [];
        
        // Objeto que muda tipo durante acesso
        const morphingObject = {};
        let callCount = 0;
        Object.defineProperty(morphingObject, 'x', {
            get: function() {
                callCount++;
                if (callCount === 1) return 42;
                if (callCount === 2) return 'string';
                if (callCount === 3) return { y: 1 };
                return undefined;
            }
        });
        traps.push(morphingObject);
        
        // Objeto com side effects no getter
        const sideEffectObject = {
            _internal: new ArrayBuffer(1024)
        };
        Object.defineProperty(sideEffectObject, 'data', {
            get: function() {
                // Força GC durante o acesso
                if (typeof gc === 'function') gc();
                return this._internal;
            }
        });
        traps.push(sideEffectObject);
        
        return traps;
    },
    
    /**
     * Gera combinações perigosas de tipos
     */
    generateTypeJuggling: function() {
        const juggling = [];
        
        const types = [null, undefined, true, false, 0, 1, -1, '', '0', '1', [], {},
                      Number.MAX_VALUE, Number.MIN_VALUE, Infinity, -Infinity, NaN];
        
        // Todas as combinações com operações perigosas
        for (const a of types.slice(0, 8)) {
            for (const b of types.slice(0, 8)) {
                try {
                    const result = {
                        values: [a, b],
                        eq_loose: a == b,
                        eq_strict: a === b,
                        add: a + b,
                        sub: a - b,
                        mul: a * b,
                        comparison: a < b,
                        typeof_a: typeof a,
                        typeof_b: typeof b
                    };
                    juggling.push(result);
                } catch(e) {}
            }
        }
        
        return juggling;
    }
};