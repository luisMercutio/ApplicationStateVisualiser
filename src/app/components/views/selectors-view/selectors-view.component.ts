import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { selectFileContent, selectFileLoading, selectFileError } from '../../../store/files/files.selectors';
import { FilesActions } from '../../../store/files/files.actions';
import * as yaml from 'js-yaml';

interface SelectorItem { name: string; slice: string; returnType: string; }

@Component({
  selector: 'app-selectors-view',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="panel-content">
      @if (loading()) {
        <div class="placeholder-empty"><mat-icon>hourglass_top</mat-icon> Loading...</div>
      } @else if (!filePath) {
        <div class="placeholder-empty"><mat-icon>filter_list</mat-icon> Select a UC</div>
      } @else if (error()) {
        <div class="placeholder-empty"><mat-icon>filter_list</mat-icon> Not yet generated</div>
      } @else {
        @for (entry of grouped(); track entry.slice) {
          <div class="slice-group">
            <div class="slice-header">{{ entry.slice }}</div>
            <table class="sel-table">
              <thead><tr><th>Selector</th><th>Return Type</th></tr></thead>
              <tbody>
                @for (sel of entry.items; track sel.name) {
                  <tr>
                    <td class="mono">{{ sel.name }}</td>
                    <td class="mono type">{{ sel.returnType }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .slice-group { margin-bottom: 16px; }
    .slice-header { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #3f51b5; padding: 6px 0 4px; letter-spacing: 0.5px; border-bottom: 2px solid #e8eaf6; margin-bottom: 6px; }
    .sel-table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th { text-align: left; padding: 6px 8px; background: #f5f5f5; color: #555; font-weight: 600; }
    td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; }
    .mono { font-family: monospace; font-size: 12px; }
    .type { color: #1976d2; }
  `],
})
export class SelectorsViewComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filePath = '';
  private store = inject(Store);
  private subs: Subscription[] = [];

  loading = signal(false);
  error = signal<string | null>(null);
  grouped = signal<Array<{ slice: string; items: SelectorItem[] }>>([]);

  ngOnInit(): void { this.subscribe(); }
  ngOnChanges(c: SimpleChanges): void {
    if (c['filePath'] && !c['filePath'].firstChange) { this.clearSubs(); this.subscribe(); }
  }
  ngOnDestroy(): void { this.clearSubs(); }
  private clearSubs(): void { this.subs.forEach(s => s.unsubscribe()); this.subs = []; }

  private subscribe(): void {
    if (!this.filePath) return;
    this.store.dispatch(FilesActions.loadFile({ path: this.filePath }));
    this.subs.push(
      this.store.select(selectFileLoading(this.filePath)).subscribe(v => this.loading.set(v)),
      this.store.select(selectFileError(this.filePath)).subscribe(v => this.error.set(v)),
      this.store.select(selectFileContent(this.filePath)).subscribe(content => {
        if (!content) return;
        try {
          const data = yaml.load(content) as any;
          const selectors: SelectorItem[] = data?.selectors ?? [];
          const map = new Map<string, SelectorItem[]>();
          for (const s of selectors) {
            const list = map.get(s.slice) ?? [];
            list.push(s);
            map.set(s.slice, list);
          }
          this.grouped.set([...map.entries()].map(([slice, items]) => ({ slice, items })));
        } catch {}
      }),
    );
  }
}
