/**
 * TEST: LocalStorage Sniffing
 * Tenta detectar informações via comportamento de storage
 * PS4 13.50: storage pode ter comportamento diferente
 */

export const testLocalStorageSniffing = {
    id: 'LOCALSTORAGE_SNIFF',
    name: 'LocalStorage Sniffing',
    risk: 'LOW',
    category: 'STORAGE',
    description: 'Tenta inferir informações via limites e comportamento do localStorage',
    ps4Compatible: true,
    
    setup: function() {
        this.storage = null;
        this.capacityResult = null;
        this.originalLength = 0;
        
        // Verifica disponibilidade
        try {
            this.storage = localStorage;
            this.originalLength = localStorage.length;
        } catch (e) {
            this.storage = null;
            this.storageError = e.message;
        }
    },
    
    probe: [
        // Probe 0: localStorage disponível?
        function(scenario) {
            try {
                return typeof localStorage !== 'undefined' ? 'AVAILABLE' : 'UNAVAILABLE';
            } catch (e) {
                return 'ERROR_' + e.message.slice(0, 20);
            }
        },
        
        // Probe 1: Capacidade aproximada
        function(scenario) {
            if (!scenario.capacityResult) return 'NOT_TESTED';
            return scenario.capacityResult;
        },
        
        // Probe 2: Comportamento com chaves especiais
        function(scenario) {
            try {
                localStorage.setItem('__proto__', 'test');
                const v = localStorage.getItem('__proto__');
                localStorage.removeItem('__proto__');
                return v === 'test' ? 'PROTO_STORED' : 'PROTO_IGNORED';
            } catch (e) {
                return 'ERROR';
            }
        },
        
        // Probe 3: Tamanho máximo de chave
        function(scenario) {
            try {
                const key = 'A'.repeat(10000);
                localStorage.setItem(key, 'test');
                localStorage.removeItem(key);
                return 'LARGE_KEY_OK';
            } catch (e) {
                return 'LARGE_KEY_FAIL';
            }
        }
    ],
    
    trigger: function() {
        // Ataque 1: Testa capacidade do storage
        if (this.storage) {
            const testData = 'A'.repeat(1024 * 10); // 10KB chunks
            let count = 0;
            const maxTests = 1000;
            
            for (let i = 0; i < maxTests; i++) {
                try {
                    localStorage.setItem(`fuzzer_capacity_${i}`, testData);
                    count++;
                } catch (e) {
                    break;
                }
            }
            
            // Limpa dados de teste
            for (let i = 0; i < count; i++) {
                localStorage.removeItem(`fuzzer_capacity_${i}`);
            }
            
            this.capacityResult = `${(count * 10).toFixed(1)}KB`;
        }
        
        // Ataque 2: Tenta causar colisão de hash
        if (this.storage) {
            const keys = [];
            for (let i = 0; i < 100; i++) {
                const key = `key_${Math.random().toString(36)}`;
                try {
                    localStorage.setItem(key, i.toString());
                    keys.push(key);
                } catch (e) {
                    break;
                }
            }
            
            // Verifica integridade
            for (const key of keys) {
                const val = localStorage.getItem(key);
                if (val !== null) {
                    this.storedValues = this.storedValues || {};
                    this.storedValues[key] = val;
                }
                localStorage.removeItem(key);
            }
        }
        
        // Ataque 3: Testa comportamento com null/undefined
        try {
            localStorage.setItem('null_value', null);
            localStorage.setItem('undefined_value', undefined);
            
            this.nullStored = localStorage.getItem('null_value');
            this.undefinedStored = localStorage.getItem('undefined_value');
            
            localStorage.removeItem('null_value');
            localStorage.removeItem('undefined_value');
        } catch (e) {}
        
        // Ataque 4: Força GC e verifica persistência
        if (typeof gc === 'function') {
            gc();
        }
    },
    
    cleanup: function() {
        // Tenta restaurar estado original
        this.storedValues = null;
        this.nullStored = null;
        this.undefinedStored = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se __proto__ foi armazenado (bug)
        if (afterResults[2] === 'PROTO_STORED') {
            return {
                anomaly: true,
                reason: '💥 STORAGE PROTO: Chave __proto__ foi armazenada, possível prototype pollution persistente'
            };
        }
        
        // Verifica se null/undefined foram convertidos para string
        if (this.nullStored === 'null') {
            return {
                anomaly: true,
                reason: '🏆 NULL COERCION: null convertido para string "null" no localStorage'
            };
        }
        
        if (this.undefinedStored === 'undefined') {
            return {
                anomaly: true,
                reason: '🏆 UNDEFINED COERCION: undefined convertido para string "undefined" no localStorage'
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};
