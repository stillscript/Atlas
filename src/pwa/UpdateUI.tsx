import { useState } from 'preact/hooks';
import { workoutActive } from '../app/state';
import { Button } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { formatShortDate } from '../lib/format';
import { applyUpdate, updateReady } from './register';
import type { WhatsNewContent } from './whatsNew';
import './update.css';

/** "Update ready" banner. Never shown while a workout is in progress. */
export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);
  if (!updateReady.value || workoutActive.value || dismissed) return null;
  return (
    <div class="update-banner" role="status">
      <span class="update-icon">
        <Icon name="sparkle" size={18} />
      </span>
      <span class="update-text">
        <strong>Update ready</strong>
        <span>A new version of Atlas is downloaded.</span>
      </span>
      <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
        Later
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={applying}
        onClick={() => {
          setApplying(true);
          applyUpdate();
        }}
      >
        {applying ? 'Updating…' : 'Update'}
      </Button>
    </div>
  );
}

interface WhatsNewSheetProps {
  content: WhatsNewContent | null;
  open: boolean;
  onClose: () => void;
}

export function WhatsNewSheet({ content, open, onClose }: WhatsNewSheetProps) {
  const releases = content?.releases ?? [];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={content?.title ?? "What's new"}
      footer={
        <Button variant="primary" size="lg" block onClick={onClose}>
          Got it
        </Button>
      }
    >
      {releases.length === 0 ? (
        <p class="whatsnew-empty">Release notes for each new version will show up here.</p>
      ) : (
        releases.map((release) => (
          <section key={release.version} class="whatsnew-release">
            <p class="whatsnew-version">
              Version {release.version}
              {release.date ? ` · ${formatShortDate(release.date)}` : ' · in this build'}
            </p>
            <ul class="whatsnew-list">
              {release.highlights.map((item) => (
                <li key={item}>
                  <Icon name="check" size={18} class="whatsnew-check" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Sheet>
  );
}
