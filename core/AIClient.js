const OpenAI = require("openai");
const { EventEmitter } = require("events");
const { logger } = require("../utils/Logger");

class AIClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer":
          config.referer || "https://github.com/your-username/ai-chat-cli",
      },
    });
    this.defaultModel = config.defaultModel || "openai/gpt-3.5-turbo";
  }

  async generateResponse(messages, options = {}) {
    try {
      const model = options.model || this.defaultModel;
      logger.debug("Generating response", {
        model,
        messageCount: messages.length,
      });

      if (options.stream) {
        return this.generateStreamingResponse(messages, options);
      }

      const response = await this.client.chat.completions.create({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        model: model,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens,
        stream: false,
      });

      // Handle file exports in the response
      const { content, files } = this.processFileExports(
        response.choices[0].message.content,
        options.conversationId
      );

      logger.info("Response generated", {
        model: response.model,
        tokens: response.usage.total_tokens,
        files: files.length,
      });

      return {
        content,
        files,
        tokenUsage: {
          total: response.usage.total_tokens,
          prompt: response.usage.prompt_tokens,
          completion: response.usage.completion_tokens,
        },
        model: response.model,
      };
    } catch (error) {
      logger.error("AI generation error:", error);
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  async generateStreamingResponse(messages, options = {}) {
    try {
      const model = options.model || this.defaultModel;
      logger.debug("Starting streaming response", { model });

      const stream = await this.client.chat.completions.create({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        model: model,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens,
        stream: true,
      });

      let fullContent = "";
      let tokenCount = 0;
      let currentFileExport = null;
      let fileContent = "";

      for await (const part of stream) {
        const content = part.choices[0]?.delta?.content || "";

        // Check for file export tags
        if (content.includes("<FileExport")) {
          const match = content.match(/<FileExport name="([^"]+)">/);
          if (match) {
            currentFileExport = match[1];
            // Don't add the opening tag to the displayed content
            fullContent += content.split("<FileExport")[0];
            fileContent = "";
            continue;
          }
        }

        if (currentFileExport && content.includes("</FileExport>")) {
          // Save the file
          const filePath = await this.saveExportedFile(
            currentFileExport,
            fileContent,
            options.conversationId
          );

          // Emit file saved event
          this.emit("fileSaved", {
            filename: currentFileExport,
            path: filePath,
          });

          // Add a nice message about the saved file
          fullContent += `\n[File saved: ${currentFileExport}]\n`;

          currentFileExport = null;
          fileContent = "";
          // Don't add the closing tag to the displayed content
          if (content.split("</FileExport>")[1]) {
            fullContent += content.split("</FileExport>")[1];
          }
        } else if (currentFileExport) {
          // Accumulate file content
          fileContent += content;
        } else {
          // Regular content
          fullContent += content;
        }

        tokenCount++;

        // Emit chunk event for real-time UI updates
        this.emit("chunk", {
          content: currentFileExport ? "" : content,
          done: false,
        });
      }

      logger.info("Streaming response completed", {
        model: model,
        estimatedTokens: tokenCount,
      });

      // Emit final chunk
      this.emit("chunk", {
        content: "",
        done: true,
      });

      return {
        content: fullContent,
        tokenUsage: {
          total: tokenCount,
          prompt: messages.reduce((acc, m) => acc + m.content.length / 4, 0),
          completion: tokenCount,
        },
        model: model,
      };
    } catch (error) {
      logger.error("AI streaming error:", error);
      throw new Error(`AI streaming failed: ${error.message}`);
    }
  }

  async saveExportedFile(filename, content, conversationId) {
    try {
      // Create exports directory for the conversation
      const exportDir = path.join("exports", conversationId.toString());
      await fs.mkdir(exportDir, { recursive: true });

      // Sanitize filename
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = path.join(exportDir, sanitizedFilename);

      // Save the file
      await fs.writeFile(filePath, content);

      logger.info("File exported successfully", {
        filename: sanitizedFilename,
        path: filePath,
      });

      return filePath;
    } catch (error) {
      logger.error("Failed to save exported file:", error);
      throw new Error(`Failed to save file ${filename}: ${error.message}`);
    }
  }

  processFileExports(content, conversationId) {
    const files = [];
    let processedContent = content;

    // Find all file exports in the content
    const regex = /<FileExport name="([^"]+)">([\s\S]*?)<\/FileExport>/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const [fullMatch, filename, fileContent] = match;

      // Save the file
      const filePath = this.saveExportedFile(
        filename,
        fileContent,
        conversationId
      );

      files.push({ filename, path: filePath });

      // Replace the file export tag with a nice message
      processedContent = processedContent.replace(
        fullMatch,
        `\n[File saved: ${filename}]\n`
      );
    }

    return { content: processedContent, files };
  }
}

module.exports = { AIClient };
