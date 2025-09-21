# Deluxe Logistics Inc. - Trailer Rental Website

## Overview

This is a full-stack web application for Deluxe Logistics Inc., a logistics company offering trailer rental and leasing services. The application serves as a marketing website with a contact form that allows potential customers to submit rental inquiries. The system captures detailed customer information including company details, fleet requirements, and service interests.

The application is built as a modern single-page application with a React frontend and Express.js backend, designed to showcase the company's extensive fleet of 65,000+ trailers across 40+ nationwide locations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives for accessible, customizable components
- **Styling**: TailwindCSS with custom CSS variables for theming and responsive design
- **State Management**: TanStack Query for server state management and data fetching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod for validation and type safety

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API endpoints for contact form submission and data retrieval
- **Validation**: Zod schemas for runtime type checking and data validation
- **Storage**: In-memory storage implementation with interface for future database integration

### Data Storage Solutions
- **Current**: In-memory storage using JavaScript Maps for development/demo purposes
- **Database Ready**: Drizzle ORM configured with PostgreSQL schema definitions
- **Schema**: Dedicated tables for users and contact requests with proper relationships
- **Connection**: Neon Database serverless PostgreSQL integration configured

### Authentication and Authorization
- **Current State**: No authentication implemented (public contact form)
- **Prepared Infrastructure**: User schema and storage methods ready for future implementation
- **Session Management**: Connect-pg-simple configured for PostgreSQL session storage

### External Dependencies
- **Database**: Neon Database (PostgreSQL) via `@neondatabase/serverless`
- **ORM**: Drizzle ORM with PostgreSQL dialect for type-safe database operations
- **Development**: Replit-specific plugins for error handling and development banner
- **UI Components**: Extensive Radix UI component library for accessibility
- **Validation**: Zod for schema validation across frontend and backend
- **Fonts**: Google Fonts integration (DM Sans, Fira Code, Geist Mono, Architects Daughter)
- **Images**: Unsplash integration for stock photography
- **Build Tools**: Vite for frontend bundling, ESBuild for backend compilation

### Development Environment
- **Hot Reload**: Vite development server with HMR
- **Type Safety**: Strict TypeScript configuration across all layers
- **Path Mapping**: Absolute imports configured for clean code organization
- **Error Handling**: Comprehensive error boundaries and runtime error overlays
- **Logging**: Custom request/response logging middleware for API monitoring

### Deployment Architecture
- **Build Process**: Separate frontend (Vite) and backend (ESBuild) compilation
- **Static Assets**: Frontend builds to `dist/public` for static file serving
- **Production**: Node.js server serves both API and static files
- **Environment**: Environment-based configuration for development vs production