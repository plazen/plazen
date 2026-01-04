# Plazen

<p align="center">
  <img src = "src/app/favicon.ico" height=100 width=100>
</p>

<h2 align="center">Let your schedule build itself.</h2>

Plazen is a modern, open-source task manager that intelligently plans your day for you. Add your flexible to-dos, and it automatically finds the perfect spot in your daily timetable. For crucial, time-sensitive appointments, you can pin them to a specific time. Reclaim your focus and reduce the mental load of planning.

<div align="center">

[![CLA assistant](https://cla-assistant.io/readme/badge/plazen/plazen)](https://cla-assistant.io/plazen/plazen)
[![MIT License](https://img.shields.io/github/license/plazen/plazen)](https://github.com/plazen/plazen/blob/main/LICENSE)
[![GitHub last commit](https://img.shields.io/github/last-commit/plazen/plazen)](https://github.com/plazen/plazen/commits/main)
[![GitHub issues](https://img.shields.io/github/issues/plazen/plazen)](https://github.com/plazen/plazen/issues)
[![GitHub forks](https://img.shields.io/github/forks/plazen/plazen)](https://github.com/plazen/plazen/network)
[![GitHub stars](https://img.shields.io/github/stars/plazen/plazen)](https://github.com/plazen/plazen/stargazers)

</div>

## ✨ Key Features

- **Automatic Scheduling**: Add tasks with an estimated duration, and Plazen will find an open slot in your schedule.
- **Time-Sensitive Tasks**: Pin important tasks or appointments to a fixed time.
- **Visual Timetable**: View your entire day at a glance with a clean, intuitive timetable interface.
- **Task Management**: Mark tasks as complete, reschedule them with a simple drag-and-drop or right-click, and delete them when no longer needed.
- **Responsive Design**: Fully functional on both desktop and mobile devices.
- **Secure Storage**: All your tasks and settings are encrypted and stored in a PostgreSQL database via Supabase.
- **Customizable View**: Adjust your timetable's start and end hours to match your day.
- **Real-time Indicator**: A "time needle" shows you the current time, helping you stay on track.
- **Secure Authentication**: User accounts are securely managed with Supabase Auth.
- **Other Calendars**: Import tasks from Google Calendar or iCal using the iCal URL.

## 🛠️ Tech Stack

<div align="center">
  <!-- Badges (shields.io) -->
  <a href="https://nextjs.org/" title="Next.js">
    <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  </a>
  <a href="https://tailwindcss.com/" title="Tailwind CSS">
    <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  </a>
  <a href="https://supabase.io/" title="Supabase">
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  </a>
  <a href="https://www.prisma.io/" title="Prisma">
    <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  </a>
  <a href="https://www.postgresql.org/" title="PostgreSQL">
    <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  </a>
  <a href="https://www.framer.com/motion/" title="Framer Motion">
    <img src="https://img.shields.io/badge/Framer_Motion-000000?style=for-the-badge&logo=framer&logoColor=white" alt="Framer Motion" />
  </a>
</div>

## 🚀 Getting Started

Follow these instructions to get a local copy up and running for development and testing purposes.

### Prerequisites

- Node.js (v24 or later)
- npm, yarn, or pnpm
- A Supabase account and a new project created.

### 1. Clone the Repository

```bash
git clone https://github.com/plazen/plazen.git
cd plazen.org
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 3. Set Up Environment Variables

Change a `env.example` file to `.env` in the root of your project and add the environment variables. You can find the Supabase URL and Anon Key in your Supabase project's API settings.

### 4. Set Up the Database

Push the Prisma schema to your Supabase database. This will create the necessary tables (`tasks`, `UserSettings`, etc.).

```bash
npx prisma db push
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost
:3000](http://localhost:3000) with your browser to see the result. You can now sign up and start using the application.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Please, see [`CONTRIBUTING.md`](CONTRIBUTING.md) for more information

## 📄 License

This project is distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.
