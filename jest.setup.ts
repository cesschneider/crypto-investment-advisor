/**
 * Jest setup — load environment variables from .env before any test runs.
 * Services read API keys from process.env at construction time.
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });
