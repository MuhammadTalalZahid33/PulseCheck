import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Centred frame shared by the login and register pages. */
@Component({
  selector: 'pc-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-12">
      <div class="flex items-center gap-2">
        <span aria-hidden="true" class="text-up-400">&#9679;</span>
        <span class="font-mono text-sm tracking-wide text-mute-200">PulseCheck</span>
      </div>
      <ng-content />
    </div>
  `,
})
export class AuthLayoutComponent {}
