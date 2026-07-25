import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppBusinessRule } from '../../../models/app-data.model';
import { categoryColor } from '../../../models/business-rule.model';
import { TechnicalSpec } from '../../../models/technical-spec.model';
import { selectAppRules } from '../../../store/app-data/app-data.selectors';
import { selectSpecByRuleId } from '../../../store/technical-specs/technical-specs.selectors';
import { selectActiveApplication } from '../../../store/applications/applications.selectors';
import { WorkspaceService } from '../../../services/workspace.service';
import { MermaidService } from '../../../services/mermaid.service';

/**
 * A single Business Rule rendered as a diagram: the rule sits at the centre with
 * edges to the features it relates to, the BRs it depends on, the artifacts its
 * technical spec produces, and the file/entity anchors it `touches`. Reached from
 * the BR List row menu ("Diagram"); the chosen rule arrives via WorkspaceService.
 * A Mermaid flowchart drives the picture; a side panel lists the same facts.
 */
@Component({
  selector: 'app-br-diagram',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="brd-root">
      <div class="brd-toolbar">
        <button mat-icon-button matTooltip="Back to Business Rules" (click)="back()"><mat-icon>arrow_back</mat-icon></button>
        <span class="title">BR Diagram</span>
        @if (rule(); as r) {
          <span class="r-name">{{ r.name }}</span>
          @if (r.category) { <span class="r-cat" [style.background]="color(r)">{{ r.category }}</span> }
        }
        <span class="spacer"></span>
        @if (rule()) {
          <button mat-stroked-button class="sm" (click)="openSpec()">
            <mat-icon>description</mat-icon> Technical spec
          </button>
        }
      </div>

      @if (!rule()) {
        <div class="msg">
          <mat-icon class="inline">bubble_chart</mat-icon>
          No Business Rule selected. Open this view from a rule's row menu on the
          <b>Business Rules</b> page.
        </div>
      } @else {
        <div class="brd-body">
          <div class="brd-diagram">
            <div #host class="mermaid-host"></div>
          </div>
          <aside class="brd-side">
            @if (rule(); as r) {
              <section>
                <h4>Rule</h4>
                <p class="rule">{{ r.rule }}</p>
                @if (r.rationale) { <p class="rationale">{{ r.rationale }}</p> }
              </section>

              @if (r.features.length) {
                <section>
                  <h4>Features</h4>
                  <div class="chips">@for (f of r.features; track f) { <span class="chip feat">{{ f }}</span> }</div>
                </section>
              }

              @if (r.dependsOn.length) {
                <section>
                  <h4>Depends on</h4>
                  <div class="chips">@for (d of r.dependsOn; track d) { <span class="chip dep">{{ d }}</span> }</div>
                </section>
              }

              @if (touchEntries().length) {
                <section>
                  <h4>Touches</h4>
                  @for (t of touchEntries(); track t.key) {
                    <div class="touch-row"><span class="touch-key">{{ t.key }}</span>
                      <div class="chips">@for (v of t.values; track v) { <span class="chip touch">{{ v }}</span> }</div>
                    </div>
                  }
                </section>
              }

              <section>
                <h4>Technical spec
                  @if (spec()) { <span class="count">{{ spec()!.artifacts.length }} artifact(s) · {{ spec()!.entries.length }} entr(y/ies)</span> }
                </h4>
                @if (!spec()) {
                  <p class="empty">No technical specification yet. Use <b>Technical spec</b> above to add one.</p>
                } @else {
                  @if (spec()!.artifacts.length) {
                    @for (a of spec()!.artifacts; track a.id) {
                      <div class="artifact">
                        <span class="art-kind" [class.add]="a.changeType === 'add'" [class.modify]="a.changeType === 'modify'" [class.remove]="a.changeType === 'remove'">{{ a.changeType }}</span>
                        <span class="art-body"><b>{{ a.kind }}</b> · <code>{{ a.path }}</code>@if (a.summary) { <span class="art-sum"> — {{ a.summary }}</span> }</span>
                      </div>
                    }
                  } @else { <p class="empty">No artifacts recorded.</p> }
                }
              </section>
            }
          </aside>
        </div>
      }
    </div>
  `,
  styles: [`
    .brd-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; }
    .brd-toolbar { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .brd-toolbar .title { font-weight: 600; color: #333; }
    .brd-toolbar .r-name { font-family: monospace; font-size: 12px; color: #3f51b5; font-weight: 700; }
    .brd-toolbar .r-cat { color: white; font-size: 9px; padding: 1px 7px; border-radius: 10px; text-transform: capitalize; }
    .spacer { flex: 1; } .sm { font-size: 12px; } .sm mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .msg { padding: 32px; color: #888; text-align: center; } .msg .inline { vertical-align: middle; }
    .brd-body { flex: 1; display: flex; min-height: 0; }
    .brd-diagram { flex: 1; overflow: auto; padding: 16px; display: flex; align-items: flex-start; justify-content: center; }
    .mermaid-host { width: 100%; }
    .mermaid-host :global(svg) { max-width: 100%; height: auto; }
    .brd-side { width: 340px; flex-shrink: 0; border-left: 1px solid #e6e6e6; overflow-y: auto; padding: 12px 14px; background: #fff; }
    .brd-side section { margin-bottom: 16px; }
    .brd-side h4 { margin: 0 0 6px; font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: 0.4px; }
    .brd-side h4 .count { text-transform: none; letter-spacing: 0; font-weight: 400; color: #999; font-size: 11px; margin-left: 6px; }
    .rule { font-size: 13px; color: #222; line-height: 1.4; margin: 0 0 6px; }
    .rationale { font-size: 12px; color: #777; line-height: 1.4; margin: 0; font-style: italic; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { font-size: 10px; padding: 2px 8px; border-radius: 10px; }
    .chip.feat { background: #e0f2f1; color: #00695c; }
    .chip.dep { background: #ede7f6; color: #4527a0; font-family: monospace; }
    .chip.touch { background: #eef1f6; color: #37474f; font-family: monospace; }
    .touch-row { display: flex; gap: 6px; margin-bottom: 4px; }
    .touch-key { font-size: 10px; color: #90a4ae; min-width: 64px; text-transform: uppercase; padding-top: 2px; }
    .empty { font-size: 12px; color: #aaa; margin: 0; }
    .artifact { display: flex; gap: 6px; padding: 4px 0; border-bottom: 1px dashed #eee; font-size: 12px; }
    .art-kind { font-size: 9px; padding: 1px 6px; border-radius: 8px; text-transform: uppercase; height: fit-content; }
    .art-kind.add { background: #e8f5e9; color: #2e7d32; } .art-kind.modify { background: #fff3e0; color: #ef6c00; } .art-kind.remove { background: #ffebee; color: #c62828; }
    .art-body { color: #333; } .art-body code { font-size: 11px; color: #1565c0; } .art-sum { color: #888; }
  `],
})
export class BrDiagramComponent {
  private store = inject(Store);
  private workspace = inject(WorkspaceService);
  private mermaid = inject(MermaidService);

  private host = viewChild<ElementRef<HTMLDivElement>>('host');

  private selectedId = this.workspace.brDiagramId;
  private rules = toSignal(this.store.select(selectAppRules), { initialValue: [] as AppBusinessRule[] });
  private specByRule = toSignal(this.store.select(selectSpecByRuleId), { initialValue: {} as Record<string, TechnicalSpec> });
  private active = toSignal(this.store.select(selectActiveApplication), { initialValue: null });

  rule = computed(() => this.rules().find((r) => r.creationIndex === this.selectedId()) ?? null);
  spec = computed<TechnicalSpec | null>(() => this.specByRule()[this.selectedId()] ?? null);

  // `touches` is a free-form Record<string, string[]>; flatten to a stable list.
  touchEntries = computed(() => {
    const t = this.rule()?.touches ?? {};
    return Object.keys(t)
      .map((key) => ({ key, values: Array.isArray(t[key]) ? t[key] : [] }))
      .filter((e) => e.values.length);
  });

  private diagram = computed(() => {
    const r = this.rule();
    if (!r) return '';
    return buildDiagram(r, this.spec());
  });

  constructor() {
    // Re-render whenever the diagram source or the host element changes.
    effect(() => {
      const el = this.host()?.nativeElement;
      const src = this.diagram();
      if (el && src) this.mermaid.render(el, src);
    });
  }

  color(r: AppBusinessRule): string { return categoryColor(r.category ?? undefined); }

  back(): void { this.workspace.page.set('br-list'); }

  openSpec(): void {
    const r = this.rule();
    if (r) this.workspace.openTechnicalSpec(r.creationIndex);
  }
}

// ── Mermaid flowchart builder ────────────────────────────────────────────────
// Escape a label for a quoted Mermaid node: drop the characters that break the
// parser (`"` closes the label; angle brackets and backticks confuse it) and
// collapse newlines. Long paths are middle-truncated to keep nodes readable.
function esc(s: unknown, max = 42): string {
  let out = String(s ?? '').replace(/[\n\r]+/g, ' ').replace(/["`<>]/g, '').trim();
  if (out.length > max) out = out.slice(0, max - 1) + '…';
  return out || ' ';
}

function buildDiagram(rule: AppBusinessRule, spec: TechnicalSpec | null): string {
  const lines: string[] = ['flowchart LR'];
  const center = `BR["${esc(rule.name)}${rule.category ? ' · ' + esc(rule.category, 16) : ''}<br/>${esc(rule.rule, 60)}"]`;
  lines.push(`  ${center}:::br`);

  rule.features.forEach((f, i) => {
    lines.push(`  f${i}(["${esc(f)}"]):::feat`);
    lines.push(`  BR --> f${i}`);
  });

  rule.dependsOn.forEach((d, i) => {
    lines.push(`  d${i}["${esc(d)}"]:::dep`);
    lines.push(`  d${i} -->|prereq| BR`);
  });

  const touches = rule.touches ?? {};
  Object.keys(touches).forEach((key, ki) => {
    const values = Array.isArray(touches[key]) ? touches[key] : [];
    values.forEach((v, vi) => {
      const id = `t${ki}_${vi}`;
      lines.push(`  ${id}[/"${esc(key)}: ${esc(v)}"/]:::touch`);
      lines.push(`  BR -.-> ${id}`);
    });
  });

  (spec?.artifacts ?? []).forEach((a, i) => {
    lines.push(`  a${i}["${esc(a.kind, 20)}<br/>${esc(a.path)}"]:::art`);
    lines.push(`  BR ==>|${esc(a.changeType, 8)}| a${i}`);
  });

  lines.push('classDef br fill:#00796b,stroke:#004d40,color:#fff,font-weight:bold;');
  lines.push('classDef feat fill:#e0f2f1,stroke:#00897b,color:#00695c;');
  lines.push('classDef dep fill:#ede7f6,stroke:#5e35b1,color:#4527a0;');
  lines.push('classDef touch fill:#eef1f6,stroke:#90a4ae,color:#37474f;');
  lines.push('classDef art fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;');
  return lines.join('\n');
}
