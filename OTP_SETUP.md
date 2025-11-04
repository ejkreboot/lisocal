# OTP Authentication Setup

The Calendgnar app now uses a proper OTP (One-Time Password) authentication flow where users receive a 6-digit code via email instead of a magic link.

## How it Works

1. **User enters email** on `/auth` page
2. **6-digit code sent** to their email via Supabase Auth
3. **User enters code** in the form that appears
4. **Code verified** and session created
5. **User redirected** to main calendar

## Supabase Configuration

Make sure your Supabase project has:

1. **Email Auth enabled** in Authentication > Settings
2. **OTP enabled** (should be enabled by default)
3. **Email templates configured** in Authentication > Email Templates
   - You can customize the OTP email template if needed
4. **Proper SMTP configured** or use Supabase's default email service

## Email Template

The default Supabase OTP email includes the 6-digit code. You can customize this in your Supabase dashboard under Authentication > Email Templates > Magic Link.

## Testing

1. Go to `http://localhost:5173/auth`
2. Enter a valid email address
3. Click "Send Code"
4. Check your email for the 6-digit code
5. Enter the code in the form
6. You should be signed in and redirected to the main calendar

## Fallback

The implementation also includes fallback support for magic links (URLs with access tokens) for compatibility, but the primary flow is the OTP code entry.