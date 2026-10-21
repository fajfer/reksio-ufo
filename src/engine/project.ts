// Application / episode / scene hierarchy from DANE/Application.def.
// Each level's objects live in "<PATH>/<NAME>.cnv" (e.g. scene S76 ->
// REKSIOUFO\PRZYGODA\76_ZLAPANY\S76.CNV); PATH is relative to DANE.

import { decodeText, parseDefinitions, type ObjectDef } from '../formats/cnv.ts';
import type { PathResolver } from './fs.ts';

export interface SceneInfo {
  name: string;
  path: string;
  background: string | null;
  music: string | null;
  def: ObjectDef;
}

export interface EpisodeInfo {
  name: string;
  path: string;
  scenes: string[];
  startWith: string;
}

export class Project {
  readonly appName: string;
  readonly appPath: string;
  readonly episodes = new Map<string, EpisodeInfo>();
  readonly scenes = new Map<string, SceneInfo>();
  readonly startEpisode: string;

  private constructor(defs: ObjectDef[]) {
    const app = defs.find((d) => d.props.get('TYPE') === 'APPLICATION');
    if (!app) throw new Error('Application.def has no APPLICATION');
    this.appName = app.name;
    this.appPath = app.props.get('PATH') ?? '';
    this.startEpisode = (app.props.get('STARTWITH') ?? '').toUpperCase();

    for (const d of defs) {
      const type = d.props.get('TYPE');
      const path = d.props.get('PATH') ?? '';
      if (type === 'EPISODE') {
        this.episodes.set(d.name, {
          name: d.name,
          path,
          scenes: (d.props.get('SCENES') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
          startWith: (d.props.get('STARTWITH') ?? '').toUpperCase(),
        });
      } else if (type === 'SCENE') {
        this.scenes.set(d.name, {
          name: d.name,
          path,
          background: d.props.get('BACKGROUND') || null,
          music: d.props.get('MUSIC') || null,
          def: d,
        });
      }
    }
  }

  static async load(resolver: PathResolver): Promise<Project> {
    const bytes = await resolver.fs.read('DANE/Application.def');
    return new Project(parseDefinitions(decodeText(bytes)));
  }

  /** Install-relative directory for a PATH value. */
  static dir(path: string): string {
    return `DANE/${path.replace(/\\/g, '/')}`;
  }

  /** CNV file holding a level's objects, or null if that level has none. */
  static cnvFor(resolver: PathResolver, path: string, name: string): string | null {
    const p = `${Project.dir(path)}/${name}.cnv`;
    return resolver.fs.has(p) ? p : null;
  }

  async loadObjects(resolver: PathResolver, path: string, name: string): Promise<ObjectDef[]> {
    const file = Project.cnvFor(resolver, path, name);
    if (!file) return [];
    return parseDefinitions(decodeText(await resolver.fs.read(file)));
  }
}
