import type { DBSchema, IDBPDatabase } from 'idb';
import type {
  CoachLogEntry,
  CustomExercise,
  Gym,
  ISODate,
  KvKey,
  KvRecord,
  MachineSetting,
  Measurement,
  Program,
  Session,
} from './types';

/** The one IndexedDB database that holds all user data. */
export const DB_NAME = 'atlas';

export interface AtlasSchema extends DBSchema {
  kv: { key: KvKey; value: KvRecord };
  gyms: { key: string; value: Gym };
  programs: { key: string; value: Program };
  exercises: { key: string; value: CustomExercise };
  sessions: {
    key: string;
    value: Session;
    indexes: { byDate: ISODate; byStatus: Session['status'] };
  };
  measurements: { key: string; value: Measurement; indexes: { byDate: ISODate } };
  machineSettings: { key: string; value: MachineSetting; indexes: { byGym: string } };
  coachLog: { key: string; value: CoachLogEntry; indexes: { byAt: number; byKey: string } };
}

export type AtlasDB = IDBPDatabase<AtlasSchema>;
