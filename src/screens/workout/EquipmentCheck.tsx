import { useState } from 'preact/hooks';
import { updateEquipment } from '../../app/workout';
import type { EquipmentItem, LoadModel } from '../../db/types';
import { expandLoadSpec, summarizeLoad } from '../../domain/loads';
import { haptic } from '../../lib/haptics';
import { Button, Segmented } from '../../ui/controls';
import { showToast } from '../../ui/feedback';
import { Sheet } from '../../ui/Sheet';
import { Dial } from './Dial';

/**
 * "Check the weights on this machine": confirm or correct the pin stack or the bar and plates, so
 * every suggestion is a weight this machine can really make. Asked once per machine.
 */
export function EquipmentCheckSheet({ open, onClose, item, units }: { open: boolean; onClose: () => void; item: EquipmentItem | null; units: string }) {
  return (
    <Sheet open={open} onClose={onClose} title="Check the weights">
      {item && <p class="check-machine">{item.name}</p>}
      {item?.load.kind === 'stack' && <StackForm key={item.id} item={item} model={item.load} units={units} onDone={onClose} />}
      {item?.load.kind === 'plates' && <PlatesForm key={item.id} item={item} model={item.load} units={units} onDone={onClose} />}
    </Sheet>
  );
}

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step + 1e-9) + 1 }, (_, i) => Math.round((from + i * step) * 100) / 100);

async function save(item: EquipmentItem, load: LoadModel, onDone: () => void, changed: boolean) {
  await updateEquipment({ ...item, load, verifyLoad: false });
  haptic('success');
  showToast(changed ? 'Saved. Suggestions now match this machine.' : 'Thanks, confirmed', 'good');
  onDone();
}

type StackModel = Extract<LoadModel, { kind: 'stack' }>;

function StackForm({ item, model, units, onDone }: { item: EquipmentItem; model: StackModel; units: string; onDone: () => void }) {
  const weights = model.weights;
  const [min, setMin] = useState(weights[0] ?? 10);
  const [max, setMax] = useState(weights[weights.length - 1] ?? 200);
  const [step, setStep] = useState(weights.length > 1 ? Math.round((weights[1]! - weights[0]!) * 100) / 100 : 10);
  const [addOn, setAddOn] = useState(String(model.addOns[0] ?? 0));
  const next = expandLoadSpec({ kind: 'stack', min, max: Math.max(min, max), step, addOns: Number(addOn) ? [Number(addOn)] : [] });
  const changed = summarizeLoad(next, units) !== summarizeLoad(model, units);

  return (
    <div class="check-form">
      <p class="sheet-copy">Look at the pin stack. Atlas only suggests weights you can actually select.</p>
      <div class="check-dials">
        <Dial label="Lightest pin" value={min} options={range(2.5, 100, 2.5)} onChange={setMin} display={String(min)} unit={units} />
        <Dial label="Heaviest pin" value={max} options={range(min, 500, step)} onChange={setMax} display={String(max)} unit={units} />
      </div>
      <p class="check-label">Each pin adds</p>
      <Segmented
        label="Each pin adds"
        options={['2.5', '5', '10', '15', '20', '25'].map((v) => ({ value: v, label: v }))}
        value={String(step)}
        onChange={(v) => setStep(Number(v))}
      />
      <p class="check-label">Add-on weight on top of the stack</p>
      <Segmented
        label="Add-on weight"
        options={[
          { value: '0', label: 'None' },
          { value: '2.5', label: '2.5' },
          { value: '5', label: '5' },
          { value: '10', label: '10' },
        ]}
        value={addOn}
        onChange={setAddOn}
      />
      <p class="check-preview num">{summarizeLoad(next, units)}</p>
      <Button variant="primary" size="lg" block onClick={() => void save(item, next, onDone, changed)}>
        {changed ? 'Save' : 'Looks right'}
      </Button>
    </div>
  );
}

type PlatesModel = Extract<LoadModel, { kind: 'plates' }>;
const STANDARD_PLATES = [45, 35, 25, 10, 5, 2.5];

function PlatesForm({ item, model, units, onDone }: { item: EquipmentItem; model: PlatesModel; units: string; onDone: () => void }) {
  const [bar, setBar] = useState(model.barWeight);
  const [pairs, setPairs] = useState<Record<number, number>>(() =>
    Object.fromEntries(STANDARD_PLATES.map((w) => [w, model.plates.find((p) => p.weight === w)?.pairs ?? 0])),
  );
  const next: PlatesModel = {
    kind: 'plates',
    barWeight: bar,
    plates: [...STANDARD_PLATES, ...model.plates.map((p) => p.weight).filter((w) => !STANDARD_PLATES.includes(w))]
      .map((weight) => ({ weight, pairs: pairs[weight] ?? model.plates.find((p) => p.weight === weight)?.pairs ?? 0 }))
      .filter((p) => p.pairs > 0),
  };
  const changed = JSON.stringify(next) !== JSON.stringify({ ...model, plates: model.plates.filter((p) => p.pairs > 0) });

  return (
    <div class="check-form">
      <p class="sheet-copy">The bar’s own weight counts. Smith bars are often lighter than 45 {units}; it’s usually stamped on the bar or the frame.</p>
      <Dial label="Bar weight" value={bar} options={range(0, 60, 2.5)} onChange={setBar} display={String(bar)} unit={units} />
      <p class="check-label">Plate pairs at this station</p>
      <div class="check-plates">
        {STANDARD_PLATES.map((weight) => (
          <Dial
            key={weight}
            label={`${weight} ${units}`}
            value={pairs[weight] ?? 0}
            options={range(0, 10, 1)}
            onChange={(n) => setPairs({ ...pairs, [weight]: n })}
            display={String(pairs[weight] ?? 0)}
            unit="pairs"
          />
        ))}
      </div>
      <p class="check-preview num">{summarizeLoad(next, units)}</p>
      <Button variant="primary" size="lg" block onClick={() => void save(item, next, onDone, changed)}>
        {changed ? 'Save' : 'Looks right'}
      </Button>
    </div>
  );
}
