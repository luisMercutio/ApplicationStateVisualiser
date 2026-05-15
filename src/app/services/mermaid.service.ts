import { Injectable } from '@angular/core';
import mermaid from 'mermaid';

let initialized = false;
let counter = 0;

@Injectable({ providedIn: 'root' })
export class MermaidService {
  init(): void {
    if (initialized) return;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
    });
    initialized = true;
  }

  async render(container: HTMLElement, diagram: string): Promise<void> {
    this.init();
    const id = `mermaid-${++counter}`;
    try {
      const { svg } = await mermaid.render(id, diagram.trim());
      container.innerHTML = svg;
    } catch (err) {
      container.innerHTML = `<pre style="color:red;font-size:12px">Diagram error: ${err}</pre>`;
    }
  }

  extractMermaidBlock(content: string): string | null {
    const match = content.match(/```mermaid\s*([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  }
}
