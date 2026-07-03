# Forms in apps built on this platform

Two valid patterns. The platform does NOT pre-install React Hook Form so each app picks.

## Pattern A: Plain server-action forms (no client deps)

Use when:

- Forms are simple (a few fields, no complex client-side state)
- You're fine with validation errors only surfacing after submit
- You want zero client-side JavaScript for forms

```tsx
// app/login/page.tsx
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

async function login(prev: unknown, formData: FormData) {
  "use server";
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  // ... your auth call
}

export default function LoginPage() {
  // Use useActionState for the form state + errors
  return (
    <form action={login}>
      <input name="email" type="email" required />
      <input name="password" type="password" required minLength={8} />
      <button type="submit">Sign in</button>
    </form>
  );
}
```

This is the pattern the demo app uses. Zero extra deps.

## Pattern B: React Hook Form + shadcn `<Form>` component

Use when:

- Forms have many fields, nested fields, or arrays
- You want inline field-level validation as the user types
- You want consistent field-level error UI

Install:

```bash
npm install react-hook-form @hookform/resolvers
# then add the shadcn Form component
npx shadcn@latest add form input button
```

Then the standard shadcn Form usage applies. See https://ui.shadcn.com/docs/components/form.

## Which one for which app

| App type                                                  | Pick                |
| --------------------------------------------------------- | ------------------- |
| Login, signup, settings forms (few fields)                | A                   |
| Multi-step booking, nested item lists, complex validation | B                   |
| Internal admin tools                                      | A is usually enough |
| Public-facing checkout / data entry                       | B for better UX     |

Pick per app, not globally. Mixing both in the same app is fine.
