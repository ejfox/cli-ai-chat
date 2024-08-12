import axios from 'axios';

const localLLMPlugin = {
  name: 'localllm',
  baseURL: 'http://localhost:1234/v1',
  apiKey: null,

  init: function(config) {
    this.baseURL = config.base_url || this.baseURL;
    this.apiKey = config.api_key;
    console.log(`Initialized Local LLM plugin with base URL: ${this.baseURL}`);
  },

  formatMessages: function(messages) {
    // Local LLM server expects messages in the same format as OpenAI
    return messages;
  },

  generateResponse: async function(messages, options = {}) {
    try {
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: options.model || 'local-model',
        messages: this.formatMessages(messages),
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1000,
        stream: true,
      }, {
        responseType: 'stream',
        headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
      });

      let fullResponse = '';
      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const content = JSON.parse(line.slice(6)).choices[0].delta.content || '';
              fullResponse += content;
            } catch (e) {
              // Ignore parsing errors for non-content lines
            }
          }
        }
      }

      return { text: fullResponse.trim() };
    } catch (error) {
      console.error('Error generating response:', error.message);
      throw error;
    }
  }
};

export default localLLMPlugin;