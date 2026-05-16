import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { selectFileContent, selectFileLoading, selectFileError } from '../../../store/files/files.selectors';
import { FilesActions } from '../../../store/files/files.actions';
import { LoadingStateComponent } from '../../loading-state/loading-state.component';
import { MermaidService } from '../../../services/mermaid.service';

@Component({
  selector: 'app-mermaid-view',
  standalone: true,
  imports: [MatIconModule, LoadingStateComponent],
  template: `
    <div class="panel-content">
      @if (loading() || error()) {
        <app-loading-state [loading]="loading()" [error]="error()"></app-loading-state>
      } @else if (!filePath) {
        <div class="placeholder-empty"><mat-icon>schema</mat-icon> Select a UC</div>
      } @else {
        <div #diagramEl class="diagram-container"></div>
      }
    </div>
  `,
  styles: [`
    .diagram-container { width: 100%; overflow: auto; }
    .diagram-container ::ng-deep svg { max-width: 100%; height: auto; }
  `],
})
export class MermaidViewComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filePath = '';
  @ViewChild('diagramEl') diagramEl?: ElementRef<HTMLDivElement>;

  private store = inject(Store);
  private mermaid = inject(MermaidService);
  private subs: Subscription[] = [];

  loading = signal(false);
  error = signal<string | null>(null);
  private pendingDiagram: string | null = null;

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
        const diagram = this.mermaid.extractMermaidBlock(content);
        if (!diagram) return;
        this.pendingDiagram = diagram;
        this.renderWhenReady();
      }),
    );
  }

  private renderWhenReady(): void {
    setTimeout(() => {
      if (this.diagramEl && this.pendingDiagram) {
        this.mermaid.render(this.diagramEl.nativeElement, this.pendingDiagram);
        this.pendingDiagram = null;
      } else if (this.pendingDiagram) {
        this.renderWhenReady();
      }
    }, 50);
  }
}
