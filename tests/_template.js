/**
 * TEST: _TEMPLATE — Template para criar novos testes
 * 
 * COMO USAR:
 * 1. Copie este arquivo
 * 2. Renomeie para seu_teste.js
 * 3. Preencha as seções marcadas com TODO
 * 4. O teste será carregado automaticamente
 */

export const testTemplate = {
    // ID único do teste (use SCREAMING_SNAKE_CASE)
    id: 'TEST_TEMPLATE',
    
    // Nome descritivo
    name: 'Template Test',
    
    // Risco: LOW, MEDIUM, HIGH, CRITICAL
    risk: 'LOW',
    
    // Categoria: CANVAS, DOM, WORKER, TIMING, PROTO, STORAGE, NETWORK, TYPES, GC, JIT
    category: 'TYPES',
    
    // Breve descrição do que o teste faz
    description: 'Template para criar novos testes modulares',
    
    // ⚠️ Compatibilidade com PS4 13.50
    ps4Compatible: true,
    
    /**
     * SETUP: Preparação antes do trigger
     * - Crie objetos, arrays, elementos DOM aqui
     * - Armazene no `this` para acessar nas probes e trigger
     */
    setup: function() {
        // TODO: Preparar ambiente do teste
        this.targetValue = 42;
        this.targetObject = { data: 'original' };
        
        // Opcional: registrar no GCOracle para tracking
        // GCOracle.track(this.targetObject, `${this.id}_target`);
    },
    
    /**
     * PROBES: Funções que medem o estado antes e depois do trigger
     * - Devem ser funções puras que retornam valores comparáveis
     * - Use arrow functions ou funções que acessam o scenario
     */
    probe: [
        // Probe 0: Verifica valor numérico
        function(scenario) {
            return scenario.targetValue;
        },
        
        // Probe 1: Verifica tipo do objeto
        function(scenario) {
            return typeof scenario.targetObject?.data;
        },
        
        // Probe 2: Verifica integridade estrutural
        function(scenario) {
            return JSON.stringify(scenario.targetObject);
        },
        
        // TODO: Adicione mais probes conforme necessário
    ],
    
    /**
     * TRIGGER: A ação que pode causar a vulnerabilidade
     * - Pode ser síncrona ou assíncrona
     * - Deve tentar corromper o estado setup
     */
    trigger: function() {
        // TODO: Implementar o ataque
        
        // Exemplo: tentar modificar objeto após condições específicas
        try {
            // Força GC se disponível (importante para UAF)
            if (typeof gc === 'function') {
                gc();
            }
            
            // Tenta acessar/modificar após possível coleta
            this.targetObject.data = 'modified';
        } catch (e) {
            // Erros esperados são normais
        }
    },
    
    /**
     * CLEANUP: Limpeza após o teste
     * - Remove elementos DOM
     * - Limpa referências para evitar leaks
     */
    cleanup: function() {
        // TODO: Limpar recursos
        this.targetValue = null;
        this.targetObject = null;
    },
    
    /**
     * CUSTOM VALIDATOR: Validação adicional (opcional)
     * Retorna { anomaly: boolean, reason: string }
     */
    customValidator: function(baseResults, afterResults) {
        // TODO: Lógica customizada de validação
        // baseResults: array com resultados das probes antes do trigger
        // afterResults: array com resultados das probes depois do trigger
        
        return {
            anomaly: false,
            reason: ''
        };
    }
};
