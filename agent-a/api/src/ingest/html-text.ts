import { decodeHTML } from 'entities';

export const HtmlText = {
  /**
   * Remove <head>, <style>, <script>, and every comment (including Outlook conditionals),
   * replace every tag with a space, decode entities, and collapse whitespace: one line.
   */
  toText(html: string): string {
    const stripped = html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<head[\s\S]*?<\/head>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]*>/g, ' ');
    return decodeHTML(stripped).replace(/[\s\u00a0]+/g, ' ').trim();
  },
};
