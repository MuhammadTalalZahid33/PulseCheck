import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AuthLayoutComponent } from './auth-layout.component';
import { CredentialsFormComponent } from './credentials-form.component';

@Component({
  selector: 'pc-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthLayoutComponent, CredentialsFormComponent],
  template: `
    <pc-auth-layout>
      <pc-credentials-form mode="login" [next]="next() ?? null" />
    </pc-auth-layout>
  `,
})
export class LoginPage {
  /** Bound from ?next= by withComponentInputBinding(). */
  readonly next = input<string>();
}
