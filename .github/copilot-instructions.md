# lisocal -- A personal calendar

## Architecture Overview

lisocal is a sveltekit-based web application designed to provide users with a dynamic and interactive personal calendar experience. The architecture is built around several key components that work together to deliver seamless functionality.

## Guiding principle

Using lisocal should feel effortless and fun, like shredding the gnar on skis. We eliminate friction wherever possible, providing users with an intuitive and engaging experience. This includes authentication, schedule entry, and calendar navigation. This also includes the developer's experience.  We strive to make the codebase clean, modular, and easy to understand, so that contributors can quickly get up to speed and start making meaningful contributions. We eschew complexity, remembering that one pair of skis is great, two can better, but 10 is just showing off.

## Key Components

1. **Framework**: SvelteKit serves as the backbone of the application, providing a robust framework for building reactive web applications with server-side rendering capabilities. Javascript is produced via Typescript for type safety and maintainability.

2. **Authentication**: The application uses two paths for authentication.
    - **OTP Authentication**: Users can sign in using an OTP sent to their email via Supabase auth.
    - **Shared Links**: Users can create shareable links to allow themselves or others to view and/or edit their calendars. The UUID-based links provide a secure-ish way to share access without requiring traditional login credentials. User data is set for the session via hooks.server.js so pages know who the user is and can render appropriately.

3. **Database**: Supabase is used as the backend database, providing a scalable and reliable solution for storing user data, calendar events, and other relevant information. The app expects PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to be set in environment variables. If they are, the app "just works". If they aren't, the app "just doesn't work". ;) 

4. **Calendar Functionality**: The essential feature of lisocal is ease of event entry. The most important view is the month view, and clicking on any day should allow quick entry of events. Just click and start typing. Rather than using complex UI elements, the user can start an entry with a time (e.g., "8A-9A") for timed events, or not specify a time for all day events. Events can be dragged and dropped to different days/times, and edited or deleted with ease. Always, everywhere, we remember: the less clicks the better.

5. **Dependencies**: Where imported tools can make our work simpler and/or the user experience better, we use them. But we avoid unnecessary dependencies that bloat the codebase or complicate maintenance. Each dependency is carefully considered for its value-add to the project.