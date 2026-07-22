import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { DbConnection, DbConnectionInput } from '../../models/db-connection.model';

export const ConnectionsActions = createActionGroup({
  source: 'Connections',
  events: {
    // Load status + list + active selection together.
    'Load Connections': emptyProps(),
    'Load Connections Success': props<{
      connections: DbConnection[];
      activeId: string | null;
      storeReady: boolean;
      storeError: string | null;
    }>(),
    'Load Connections Failure': props<{ error: string }>(),

    'Create Connection': props<{ input: DbConnectionInput }>(),
    'Create Connection Success': props<{ connection: DbConnection }>(),
    'Create Connection Failure': props<{ error: string }>(),

    'Update Connection': props<{ id: string; input: DbConnectionInput }>(),
    'Update Connection Success': props<{ connection: DbConnection }>(),
    'Update Connection Failure': props<{ error: string }>(),

    'Delete Connection': props<{ id: string }>(),
    'Delete Connection Success': props<{ id: string }>(),
    'Delete Connection Failure': props<{ error: string }>(),

    'Set Active': props<{ id: string | null }>(),
    'Set Active Success': props<{ activeId: string | null }>(),
    'Set Active Failure': props<{ error: string }>(),
  },
});
