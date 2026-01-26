# F1 React

A modern Formula 1 statistics and racing information web application built with React and Vite. This project showcases current driver standings, team standings, race information, and historical data in an interactive UI.

## Features

- **Driver Standings**: View current driver rankings and statistics
- **Team/Constructor Standings**: Track constructor championship positions
- **Race Information**: Browse race details, track information, and results
- **Driver Details**: Comprehensive driver profiles with career information
- **Team Information**: Constructor team data and images
- **Race Animation**: Visual representation of race data
- **Responsive Design**: Mobile-friendly interface

## Tech Stack

- **Frontend**: React 19.2+ with React Router 7.12+
- **Build Tool**: Vite 7.2+
- **Styling**: CSS3
- **Linting**: ESLint 9.39+
- **Package Manager**: npm

## Getting Started

### Prerequisites

- Node.js (14+ recommended)
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd F1-React
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the port shown in your terminal).

## Available Scripts

- `npm run dev` - Start the development server with HMR
- `npm run build` - Build the project for production
- `npm run preview` - Preview the production build locally
- `npm run lint` - Run ESLint to check code quality

## Project Structure

```
src/
├── components/           # Reusable components
│   ├── races/           # Race-related components
│   ├── standings/       # Standings display components
│   ├── header.jsx       # Header component
│   └── ...
├── pages/               # Page components (Router pages)
│   ├── drivers.jsx
│   ├── teams.jsx
│   ├── races.jsx
│   ├── standings.jsx
│   └── home.jsx
├── assets/              # Static assets
├── App.jsx              # Main app component
└── main.jsx             # Entry point
```

## Contributing

Contributions are welcome! Please feel free to submit a pull request.

## License

This project is open source and available under the MIT License.

## Notes

- This project uses Vite for fast development and optimized production builds
- ESLint is configured for code quality and consistency
- Components are organized by feature for easy navigation and maintenance
