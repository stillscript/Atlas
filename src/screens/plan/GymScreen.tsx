import { useRef, useState } from 'preact/hooks';
import { addGym, editGym, gyms, removeGym, switchGym } from '../../app/edit';
import { goBack } from '../../app/router';
import { activeGym, activeProgram } from '../../app/state';
import { activeSession } from '../../app/workout';
import type { EquipmentCategory, EquipmentItem, Gym } from '../../db/types';
import { EQUIPMENT, GYM_PRESETS, requireExercise } from '../../domain/catalog';
import { createGymFromCatalog, createGymFromPreset } from '../../domain/gym';
import { addEquipment, missingEquipment, remapDayForGym, removeEquipment, renameGym } from '../../domain/gymEdit';
import { availableLoads, summarizeLoad } from '../../domain/loads';
import { plural } from '../../lib/format';
import { PillToggle } from '../../ui/choices';
import { Button, Toggle } from '../../ui/controls';
import { showToast } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { ListGroup, ListRow } from '../../ui/List';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Sheet } from '../../ui/Sheet';
import { LoadEditor } from '../workout/EquipmentCheck';
import './plan.css';

const CATEGORY_ORDER: { category: EquipmentCategory; title: string }[] = [
  { category: 'machine', title: 'Machines' },
  { category: 'cable', title: 'Cables' },
  { category: 'free-weight', title: 'Free weights' },
  { category: 'support', title: 'Benches and racks' },
  { category: 'bodyweight', title: 'Bodyweight' },
  { category: 'other', title: 'Other' },
  // Cardio machines stay in the gym's data but aren't shown: Atlas doesn't log cardio.
];

/** Plan exercises that would change if this item weren't here (for the remove warning). */
function affectedBy(item: EquipmentItem, gym: Gym): string[] {
  const program = activeProgram.value;
  if (!program) return [];
  const without = { ...gym, equipment: gym.equipment.filter((e) => e.id !== item.id) };
  const names = new Set<string>();
  for (const day of program.days) for (const change of remapDayForGym(day, without).changes) {
    if (remapDayForGym(day, gym).changes.some((c) => c.slotId === change.slotId)) continue;
    names.add(requireExercise(change.from).name);
  }
  return [...names];
}

export function GymScreen() {
  const gym = activeGym.value;
  const [openItem, setOpenItem] = useState<EquipmentItem | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [addEquipOpen, setAddEquipOpen] = useState(false);
  const [addGymOpen, setAddGymOpen] = useState(false);
  const [otherGym, setOtherGym] = useState<Gym | null>(null);
  if (!gym) {
    return (
      <main class="screen">
        <ScreenHeader title="Gym" onBack={() => goBack('plan')} backLabel="Plan" />
      </main>
    );
  }
  const needsCheck = gym.equipment.filter((item) => item.verifyLoad).length;
  const others = gyms.value.filter((g) => g.id !== gym.id);

  return (
    <main class="screen">
      <ScreenHeader title={gym.name} onBack={() => goBack('plan')} backLabel="Plan" />

      <ListGroup title="Your gyms" footer="Your plan follows you: in a gym without an exercise, Atlas uses the closest thing it has.">
        <ListRow icon="building" tone="accent" label={gym.name} detail="Training here · tap to rename" value={<Icon name="check" size={18} />} onClick={() => setRenameOpen(true)} />
        {others.map((g) => (
          <ListRow key={g.id} icon="building" label={g.name} detail={plural(g.equipment.length, 'piece') + ' of equipment'} chevron onClick={() => setOtherGym(g)} />
        ))}
        <ListRow icon="plus" tone="accent" label="Add a gym" onClick={() => setAddGymOpen(true)} />
      </ListGroup>

      {CATEGORY_ORDER.map(({ category, title }) => {
        const items = gym.equipment.filter((item) => item.category === category);
        if (!items.length) return null;
        return (
          <ListGroup
            key={category}
            title={title}
            footer={
              category === 'machine' && needsCheck > 0
                ? 'Weight steps marked “check on first use” come from the manufacturer’s specs. Atlas asks you to confirm them the first time you use each one, or tap to set them now.'
                : undefined
            }
          >
            {items.map((item) => {
              const summary = item.load.kind === 'none' ? '' : summarizeLoad(item.load, gym.units);
              const options = availableLoads(item.load).length;
              return (
                <ListRow
                  key={item.id}
                  label={item.name}
                  detail={
                    <>
                      <span class="gym-load">{summary}</span>
                      {item.verifyLoad && options > 1 ? ' · check on first use' : ''}
                    </>
                  }
                  chevron
                  onClick={() => setOpenItem(item)}
                />
              );
            })}
          </ListGroup>
        );
      })}

      <ListGroup>
        <ListRow icon="plus" tone="accent" label="Add equipment" detail="Anything this gym has that isn’t listed" onClick={() => setAddEquipOpen(true)} />
      </ListGroup>

      <EquipmentSheet item={openItem} gym={gym} onClose={() => setOpenItem(null)} />
      <RenameGymSheet open={renameOpen} gym={gym} onClose={() => setRenameOpen(false)} />
      <AddEquipmentSheet open={addEquipOpen} gym={gym} onClose={() => setAddEquipOpen(false)} />
      <AddGymSheet open={addGymOpen} onClose={() => setAddGymOpen(false)} />
      <OtherGymSheet gym={otherGym} onClose={() => setOtherGym(null)} />
    </main>
  );
}

function EquipmentSheet({ item, gym, onClose }: { item: EquipmentItem | null; gym: Gym; onClose: () => void }) {
  const last = useRef(item);
  if (item) last.current = item;
  const current = last.current;
  // Always read the latest version (a saved weight change updates the gym).
  const live = current ? (gym.equipment.find((e) => e.id === current.id) ?? current) : null;
  const affected = live ? affectedBy(live, gym) : [];
  return (
    <Sheet open={item !== null} onClose={onClose} title={live?.name ?? 'Equipment'}>
      {live && (
        <div class="check-form">
          {live.loadNote && <p class="sheet-copy">{live.loadNote}</p>}
          <LoadEditor item={live} units={gym.units} onDone={onClose} />
          {live.load.kind === 'none' && (
            <p class="sheet-copy">No weights to set for this one.</p>
          )}
          <div class="danger-zone">
            <p class="field-hint">
              {affected.length
                ? `Without it, ${affected.join(', ')} ${affected.length === 1 ? 'gets' : 'get'} the closest alternative here.`
                : 'Nothing in your plan depends on it.'}
            </p>
            <Button
              variant="ghost"
              block
              icon="trash"
              onClick={() => {
                void editGym((g, now) => removeEquipment(g, live.id, now), { undo: `${live.name} removed` });
                onClose();
              }}
            >
              Remove from {gym.name}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function RenameGymSheet({ open, gym, onClose }: { open: boolean; gym: Gym; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Gym name"
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => {
            const value = input.current?.value ?? '';
            void editGym((g, now) => renameGym(g, value, now));
            onClose();
          }}
        >
          Save
        </Button>
      }
    >
      <input key={`${open}`} ref={input} class="field-input" type="text" maxLength={40} defaultValue={gym.name} aria-label="Gym name" autoComplete="off" />
      <p class="field-hint" style={{ marginTop: 'var(--space-2)' }}>
        Weights are in {gym.units}.
      </p>
    </Sheet>
  );
}

function AddEquipmentSheet({ open, gym, onClose }: { open: boolean; gym: Gym; onClose: () => void }) {
  const missing = missingEquipment(gym);
  return (
    <Sheet open={open} onClose={onClose} title="Add equipment">
      {CATEGORY_ORDER.map(({ category, title }) => {
        const items = missing.filter((d) => d.category === category);
        if (!items.length) return null;
        return (
          <div key={category} class="add-equipment-group">
            <p class="ex-section-title">{title}</p>
            <div class="swap-list">
              {items.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  class="swap-option"
                  onClick={() => {
                    void editGym((g, now) => addEquipment(g, def.id, now)).then(
                      (ok) => ok && showToast(`${def.shortName} added${def.verifyLoad ? '. Check its weights on first use.' : ''}`, 'good', 4000),
                    );
                  }}
                >
                  <span class="swap-text">
                    <span class="swap-name">{def.shortName}</span>
                    <span class="swap-meta">{def.name}</span>
                  </span>
                  <Icon name="plus" size={18} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </Sheet>
  );
}

function AddGymSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<string>('custom');
  const [selected, setSelected] = useState<string[]>([]);
  const [makeActive, setMakeActive] = useState(true);
  const name = useRef<HTMLInputElement>(null);
  const checklist = EQUIPMENT.filter((e) => e.checklist);
  const blocked = Boolean(activeSession.value) && makeActive;
  const create = async () => {
    const now = Date.now();
    const gym = mode === 'custom' ? createGymFromCatalog(name.current?.value.trim() || 'My gym', selected, now) : createGymFromPreset(mode, now);
    if (mode !== 'custom' && name.current?.value.trim()) gym.name = name.current.value.trim();
    await addGym(gym, makeActive);
    showToast(makeActive ? `Added ${gym.name}` : `Added ${gym.name}. Switch to it any time.`, 'good');
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a gym"
      footer={
        <Button variant="primary" size="lg" block disabled={(mode === 'custom' && !selected.length) || blocked} onClick={() => void create()}>
          {blocked ? 'Finish your workout first' : 'Add gym'}
        </Button>
      }
    >
      <div class="field-form" key={`${open}`}>
        <label class="field">
          <span class="field-label">Name</span>
          <input ref={name} class="field-input" type="text" maxLength={40} placeholder="Home, Hotel, Downtown…" autoComplete="off" />
        </label>
        <div class="choice-rows">
          {[...GYM_PRESETS.map((p) => ({ id: p.id, title: p.name, meta: p.description })), { id: 'custom', title: 'Pick the equipment', meta: 'Tick what it has' }].map((o) => (
            <button key={o.id} type="button" class={mode === o.id ? 'swap-option is-selected' : 'swap-option'} onClick={() => setMode(o.id)}>
              <span class="swap-text">
                <span class="swap-name">{o.title}</span>
                <span class="swap-meta">{o.meta}</span>
              </span>
              {mode === o.id && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
        {mode === 'custom' && (
          <div class="pill-row">
            {checklist.map((item) => (
              <PillToggle
                key={item.id}
                label={item.shortName}
                selected={selected.includes(item.id)}
                onToggle={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])}
              />
            ))}
          </div>
        )}
        <div class="row-inline">
          <label class="row-inline-text" for="gym-active">
            <span class="field-label">Train here now</span>
            <span class="field-hint">Switch back any time from this screen.</span>
          </label>
          <Toggle id="gym-active" checked={makeActive} onChange={setMakeActive} />
        </div>
      </div>
    </Sheet>
  );
}

function OtherGymSheet({ gym, onClose }: { gym: Gym | null; onClose: () => void }) {
  const last = useRef(gym);
  if (gym) last.current = gym;
  const g = last.current;
  const [confirm, setConfirm] = useState(false);
  const busy = Boolean(activeSession.value);
  return (
    <Sheet
      open={gym !== null}
      onClose={() => {
        setConfirm(false);
        onClose();
      }}
      title={g?.name ?? 'Gym'}
      footer={
        g && (
          <>
            <Button
              variant="primary"
              size="lg"
              block
              disabled={busy}
              onClick={() => {
                void switchGym(g.id);
                onClose();
              }}
            >
              {busy ? 'Finish your workout first' : 'Train here'}
            </Button>
            {confirm ? (
              <Button
                variant="danger"
                block
                onClick={() => {
                  void removeGym(g.id).then(() => showToast(`${g.name} removed`));
                  setConfirm(false);
                  onClose();
                }}
              >
                Remove {g.name} and its machine settings
              </Button>
            ) : (
              <Button variant="ghost" block icon="trash" onClick={() => setConfirm(true)}>
                Remove this gym
              </Button>
            )}
          </>
        )
      }
    >
      {g && (
        <p class="sheet-copy">
          {plural(g.equipment.length, 'piece')} of equipment. Workouts you did there stay in your history either way.
        </p>
      )}
    </Sheet>
  );
}
