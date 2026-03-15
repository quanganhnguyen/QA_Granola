import type { IClaudeClient } from './ClaudeMergeService';

export class DefaultClaudeClient implements IClaudeClient {
  async complete(prompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }
    return content.text;
  }
}
