#!/usr/bin/env node
// Ponto de entrada do CDK (ver cdk.json).
import { criarApp } from '../lib/app.js';

criarApp().app.synth();
