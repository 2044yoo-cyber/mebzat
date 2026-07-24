import { z } from "zod";

const email = z.string().trim().min(1, "Email is required").email("Enter a valid email");
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name"),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Enter phone number in international format, e.g. +15551234567"),
});

export const phoneOtpSchema = z.object({
  phone: z.string(),
  token: z.string().length(6, "Enter the 6-digit code"),
});
