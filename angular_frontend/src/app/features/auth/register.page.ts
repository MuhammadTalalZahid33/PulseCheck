import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AuthLayoutComponent } from './auth-layout.component';
import { CredentialsFormComponent } from './credentials-form.component';

@Component({
  selector: 'pc-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthLayoutComponent, CredentialsFormComponent],
  template: `
    <pc-auth-layout>
      <pc-credentials-form mode="register" [next]="next() ?? null" />
    </pc-auth-layout>
  `,
})
export class RegisterPage {
  readonly next = input<string>();
}
