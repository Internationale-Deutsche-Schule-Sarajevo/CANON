/**
 * All Zod validation schemas — single source of truth
 * Import from here everywhere — never write inline validation
 */

import { z } from "zod";

export const RegisterSchema = z.object({
  full_name: z.string().min(2, "Ime mora imati najmanje 2 karaktera"),
  email: z.string().email("Neispravna email adresa"),
  password: z.string().min(8, "Lozinka mora imati najmanje 8 karaktera"),
  role_requested: z.enum(["user", "admin"]).default("user"),
});

export const LoginSchema = z.object({
  email: z.string().email("Neispravna email adresa"),
  password: z.string().min(1, "Lozinka je obavezna"),
});

export const ApproveRegistrationSchema = z.object({
  request_id: z.string().uuid(),
});

export const RejectRegistrationSchema = z.object({
  request_id: z.string().uuid(),
  reason: z
    .string()
    .min(10, "Razlog odbijanja mora imati najmanje 10 karaktera"),
});

// Reset lozinke — koristi se na /reset-password stranici.
// Pravila validacije žive OVDJE (E-2, M-7), nikad inline u komponenti.
export const ResetPasswordSchema = z
  .object({
    password: z.string().min(8, "Lozinka mora imati najmanje 8 karaktera"),
    confirmPassword: z.string().min(1, "Potvrda lozinke je obavezna"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Lozinke se ne podudaraju",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ApproveRegistrationInput = z.infer<
  typeof ApproveRegistrationSchema
>;
export type RejectRegistrationInput = z.infer<typeof RejectRegistrationSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
