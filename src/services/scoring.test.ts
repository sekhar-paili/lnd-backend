import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QuizQuestion, sanitizeQuizForLearner, scoreQuiz } from './scoring';

const questions: QuizQuestion[] = [
  { id: 'q1', type: 'MCQ', prompt: '2+2', options: [{ id: 'a', label: '3' }, { id: 'b', label: '4' }], correctOptionId: 'b' },
  { id: 'q2', type: 'TRUE_FALSE', prompt: 'Sky is blue', options: [{ id: 't', label: 'True' }, { id: 'f', label: 'False' }], correctOptionId: 't' },
  { id: 'q3', type: 'MCQ', prompt: '3+3', options: [{ id: 'a', label: '5' }, { id: 'b', label: '6' }], correctOptionId: 'b' },
];

test('scores all-correct answers as 100%, passed', () => {
  const result = scoreQuiz(questions, { q1: 'b', q2: 't', q3: 'b' }, 70);
  assert.equal(result.scorePercent, 100);
  assert.equal(result.correctCount, 3);
  assert.equal(result.passed, true);
});

test('scores partial answers correctly and fails below pass mark', () => {
  const result = scoreQuiz(questions, { q1: 'b', q2: 'f', q3: 'a' }, 70);
  assert.equal(result.correctCount, 1);
  assert.equal(Math.round(result.scorePercent), 33);
  assert.equal(result.passed, false);
});

test('passes exactly at the pass mark boundary', () => {
  // 2 of 3 correct = 66.67%; pass mark 60% -> should pass.
  const result = scoreQuiz(questions, { q1: 'b', q2: 't', q3: 'a' }, 60);
  assert.equal(result.passed, true);
});

test('fails just below the pass mark boundary', () => {
  const result = scoreQuiz(questions, { q1: 'b', q2: 't', q3: 'a' }, 67);
  assert.equal(result.passed, false);
});

test('missing/unanswered questions count as incorrect, not crash', () => {
  const result = scoreQuiz(questions, { q1: 'b' }, 50);
  assert.equal(result.correctCount, 1);
  assert.equal(result.totalCount, 3);
});

test('an empty question set scores 0 and never passes', () => {
  const result = scoreQuiz([], {}, 0);
  assert.equal(result.scorePercent, 0);
  assert.equal(result.passed, false);
});

test('sanitizeQuizForLearner strips the correct-option key', () => {
  const quiz = { id: 'quiz1', title: 'T', passMarkPercent: 70, questions };
  const sanitized = sanitizeQuizForLearner(quiz);
  for (const q of sanitized.questions) {
    assert.equal('correctOptionId' in q, false);
  }
  assert.equal(sanitized.questions.length, questions.length);
});
