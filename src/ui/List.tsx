import type { ComponentChildren } from 'preact';
import { haptic } from '../lib/haptics';
import { Icon, type IconName } from './Icon';
import { Toggle } from './controls';
import './list.css';

type Tone = 'accent' | 'good' | 'warn' | 'danger' | 'win' | 'neutral';

interface ListGroupProps {
  title?: string;
  footer?: ComponentChildren;
  children: ComponentChildren;
}

/** An inset, rounded group of rows, iOS Settings style. */
export function ListGroup({ title, footer, children }: ListGroupProps) {
  return (
    <section class="list-group">
      {title && <h2 class="list-title">{title}</h2>}
      <div class="list">{children}</div>
      {footer && <p class="list-footer">{footer}</p>}
    </section>
  );
}

function RowIcon({ icon, tone = 'neutral' }: { icon: IconName; tone?: Tone }) {
  return (
    <span class={`row-icon tone-${tone}`}>
      <Icon name={icon} size={18} />
    </span>
  );
}

interface ListRowProps {
  label: ComponentChildren;
  detail?: ComponentChildren;
  value?: ComponentChildren;
  icon?: IconName;
  tone?: Tone;
  chevron?: boolean;
  destructive?: boolean;
  onClick?: () => void;
}

export function ListRow({ label, detail, value, icon, tone, chevron, destructive, onClick }: ListRowProps) {
  const content = (
    <>
      {icon && <RowIcon icon={icon} tone={tone} />}
      <span class="row-text">
        <span class={destructive ? 'row-label is-destructive' : 'row-label'}>{label}</span>
        {detail && <span class="row-detail">{detail}</span>}
      </span>
      {value !== undefined && <span class="row-value">{value}</span>}
      {chevron && <Icon name="chevron-right" size={18} class="row-chevron" />}
    </>
  );
  if (!onClick) return <div class="row">{content}</div>;
  return (
    <button
      type="button"
      class="row row-button"
      onClick={() => {
        haptic('tap');
        onClick();
      }}
    >
      {content}
    </button>
  );
}

interface ToggleRowProps {
  id: string;
  label: ComponentChildren;
  detail?: ComponentChildren;
  icon?: IconName;
  tone?: Tone;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleRow({ id, label, detail, icon, tone, checked, onChange }: ToggleRowProps) {
  return (
    <div class="row">
      {icon && <RowIcon icon={icon} tone={tone} />}
      <label class="row-text" for={id}>
        <span class="row-label">{label}</span>
        {detail && <span class="row-detail">{detail}</span>}
      </label>
      <Toggle id={id} checked={checked} onChange={onChange} />
    </div>
  );
}

interface ControlRowProps {
  label: ComponentChildren;
  detail?: ComponentChildren;
  children: ComponentChildren;
}

/** A row whose control sits under the label (segmented controls, steppers). */
export function ControlRow({ label, detail, children }: ControlRowProps) {
  return (
    <div class="row row-stacked">
      <span class="row-text">
        <span class="row-label">{label}</span>
        {detail && <span class="row-detail">{detail}</span>}
      </span>
      <div class="row-control">{children}</div>
    </div>
  );
}
