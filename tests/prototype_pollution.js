/**
 * TEST: Prototype Pollution
 * Tenta poluir Object.prototype via vários vetores
 * PS4 13.50: Object, Array, JSON disponíveis
 */

export const testPrototypePollution = {
    id: 'PROTO_POLLUTION',
    name: 'Prototype Pollution',
    risk: 'HIGH',
    category: 'PROTO',
    description: 'Tenta injetar propriedades maliciosas no prototype chain',
    ps4Compatible: true,
    
    setup: function() {
        // Cria objetos limpos para teste
        this.cleanObjects = [];
        for (let i = 0; i < 10; i++) {
            this.cleanObjects.push({});
        }
        
        // Cria objetos com configurações específicas
        this.frozenObj = Object.freeze({ safe: true });
        this.sealedObj = Object.seal({ sealed: true });
        this.nullProtoObj = Object.create(null);
        
        // Armazena estado original do prototype
        this.originalHasOwnProperty = Object.prototype.hasOwnProperty;
        this.originalPolluted = Object.prototype.polluted;
    },
    
    probe: [
        // Probe 0: Object.prototype está limpo?
        function(scenario) {
            return Object.prototype.polluted ?? 'CLEAN';
        },
        
        // Probe 1: Objetos novos são afetados?
        function(scenario) {
            const fresh = {};
            return fresh.polluted ?? 'CLEAN';
        },
        
        // Probe 2: Objeto com null prototype
        function(scenario) {
            return scenario.nullProtoObj?.polluted ?? 'NULL_PROTO';
        },
        
        // Probe 3: Objeto frozen
        function(scenario) {
            return scenario.frozenObj?.polluted ?? 'FROZEN';
        },
        
        // Probe 4: JSON.parse cria objetos poluídos?
        function(scenario) {
            try {
                const parsed = JSON.parse('{"test":true}');
                return parsed.polluted ?? 'CLEAN';
            } catch (e) {
                return 'PARSE_ERROR';
            }
        }
    ],
    
    trigger: function() {
        // Vetor 1: Object.assign com __proto__
        try {
            Object.assign({}, JSON.parse('{"__proto__":{"polluted":"ASSIGN_VECTOR"}}'));
        } catch (e) {}
        
        // Vetor 2: Spread operator
        try {
            const polluted = { ...JSON.parse('{"__proto__":{"polluted":"SPREAD_VECTOR"}}') };
        } catch (e) {}
        
        // Vetor 3: Object.create com payload
        try {
            const payload = JSON.parse('{"__proto__":{"polluted":"CREATE_VECTOR"}}');
            Object.create(payload);
        } catch (e) {}
        
        // Vetor 4: Merge-like pollution via recursive
        const mergePollute = function(target, source) {
            for (const key in source) {
                if (typeof source[key] === 'object' && source[key] !== null) {
                    if (!target[key]) target[key] = {};
                    mergePollute(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        };
        
        try {
            mergePollute({}, JSON.parse('{"__proto__":{"polluted":"MERGE_VECTOR"}}'));
        } catch (e) {}
        
        // Vetor 5: Constructor.prototype pollution
        try {
            const malicious = JSON.parse('{"constructor":{"prototype":{"polluted":"CONSTRUCTOR_VECTOR"}}}');
            Object.assign({}, malicious);
        } catch (e) {}
        
        // Vetor 6: Object.defineProperty indireto
        try {
            const desc = Object.getOwnPropertyDescriptor({}, '__proto__');
            if (desc) {
                // Tenta modificar descriptor
            }
        } catch (e) {}
        
        // Força GC para verificar persistência
        if (typeof gc === 'function') {
            gc();
        }
    },
    
    cleanup: function() {
        this.cleanObjects = null;
        this.frozenObj = null;
        this.sealedObj = null;
        this.nullProtoObj = null;
        
        // Tenta limpar prototype se foi poluído
        try {
            delete Object.prototype.polluted;
        } catch (e) {}
    },
    
    customValidator: function(baseResults, afterResults) {
        const vectors = ['ASSIGN_VECTOR', 'SPREAD_VECTOR', 'CREATE_VECTOR', 
                        'MERGE_VECTOR', 'CONSTRUCTOR_VECTOR'];
        
        // Verifica se prototype foi poluído
        if (afterResults[0] !== 'CLEAN') {
            return {
                anomaly: true,
                reason: `💥 PROTO POLLUTION: Object.prototype.polluted = "${afterResults[0]}"`
            };
        }
        
        // Verifica se objetos novos são afetados
        if (afterResults[1] !== 'CLEAN') {
            return {
                anomaly: true,
                reason: `🏆 INHERITED POLLUTION: Novos objetos herdam propriedade poluída: "${afterResults[1]}"`
            };
        }
        
        // Verifica se JSON.parse cria objetos poluídos
        if (afterResults[4] !== 'CLEAN') {
            return {
                anomaly: true,
                reason: `🏆 JSON PARSE POLLUTION: JSON.parse cria objetos com poluição: "${afterResults[4]}"`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};
