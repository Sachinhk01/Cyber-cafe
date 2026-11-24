import { useState } from 'react';

// Password box with an eye button to show or hide what you typed.
const EYE = 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
const EYE_OFF =
  'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22';

export function PasswordInput({ id, value, onChange, autoComplete, required, autoFocus, placeholder, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} required={required} autoFocus={autoFocus} placeholder={placeholder} {...rest} />
      <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={show ? EYE_OFF : EYE} />
        </svg>
      </button>
    </div>
  );
}