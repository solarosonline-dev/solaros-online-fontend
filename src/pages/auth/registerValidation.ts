const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const PHONE_RE = /^[6-9]\d{9}$/;

export type RegisterFormValues = {
  name: string;
  gstno: string;
  address: string;
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

export type RegisterFieldErrors = Partial<Record<keyof RegisterFormValues, string>>;

export function validateRegisterForm(values: RegisterFormValues): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};

  if (!values.name.trim()) errors.name = "Business name is required.";

  if (!values.gstno.trim()) errors.gstno = "GST number is required.";
  else if (!GSTIN_RE.test(values.gstno.trim().toUpperCase())) errors.gstno = "Enter a valid 15-character GSTIN.";

  if (!values.address.trim()) errors.address = "Address is required.";

  if (!values.fullName.trim()) errors.fullName = "Full name is required.";

  if (!values.email.trim()) errors.email = "Work email is required.";
  else if (!EMAIL_RE.test(values.email.trim())) errors.email = "Enter a valid email address.";

  const digitsOnlyPhone = values.phone.replace(/\D/g, "");
  if (!values.phone.trim()) errors.phone = "Phone is required.";
  else if (!PHONE_RE.test(digitsOnlyPhone)) errors.phone = "Enter a valid 10-digit mobile number.";

  if (!values.password) errors.password = "Password is required.";
  else if (values.password.length < 8) errors.password = "Password must be at least 8 characters.";
  else if (!/[A-Z]/.test(values.password)) errors.password = "Password needs at least one uppercase letter.";
  else if (!/\d/.test(values.password)) errors.password = "Password needs at least one number.";
  else if (!/[^A-Za-z0-9]/.test(values.password)) errors.password = "Password needs at least one special character.";

  if (!values.confirmPassword) errors.confirmPassword = "Please confirm your password.";
  else if (values.password && values.password !== values.confirmPassword) {
    errors.confirmPassword = "Passwords don't match.";
  }

  return errors;
}
