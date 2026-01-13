# Refactoring Plan: IMEHandler Integration

## IMEHandler가 Mention 클래스에서 필요로 하는 것들

### Public Properties (isOpen를 public으로 변경)
- `isOpen: boolean` - IMEHandler에서 멘션 리스트가 열려있는지 확인

### Public Methods (새로 추가 필요)
1. `getMaxChars(): number` - options.maxChars 반환
2. `getMentionDenotationChars(): string[]` - options.mentionDenotationChars 반환
3. `getIsolateCharacter(): boolean` - options.isolateCharacter 반환
4. `getAllowInlineMentionChar(): boolean` - options.allowInlineMentionChar 반환
5. `getMinChars(): number` - options.minChars 반환
6. `getAllowedCharsRegex(denotationChar: string): RegExp` - 이미 존재 (그대로 유지)
7. `setMentionCharPos(pos: number): void` - this.mentionCharPos 설정
8. `performSearch(searchTerm: string, mentionChar: string): void` - 검색 수행
9. `cancelSearchAndHide(): void` - 검색 취소 및 리스트 숨김
10. `handleEscape(): void` - Escape 키 처리
11. `triggerSomethingChange(): void` - onSomethingChange 호출

## Mention 클래스에서 수정이 필요한 메서드들

### Constructor
- IMEHandler 인스턴스 생성
- 기존의 composition 이벤트 리스너 제거 (IMEHandler로 이동)
- 기존의 document Escape 리스너 제거 (IMEHandler로 이동)
- 기존의 화살표 키 리스너 제거 (IMEHandler로 이동)

### upHandler()
- IMEHandler.setSkipNextCompositionEnd() 호출 추가

### downHandler()
- IMEHandler.setSkipNextCompositionEnd() 호출 추가

### insertItem()
- 실제 커서 위치 사용 로직 유지 (master에는 없는 수정)

### renderList()
- suspendMouseEnter = true 추가 (master에는 없는 수정)

### onTextChange()
- composition 중인지 체크하여 검색 건너뛰기 추가

## Master 브랜치에서 제거할 것
1. `isComposing`, `isCompositionUpdated`, `skipNextCompositionEnd` 변수
2. `onCompositionStart()`, `onCompositionUpdate()`, `onCompositionEnd()` 메서드
3. Constructor의 composition 이벤트 리스너
4. Constructor의 document Escape 리스너
5. Constructor의 화살표 키 리스너

## 작업 순서
1. ✅ IMEHandler 클래스 생성 완료
2. ⬜ Master 기반 mention.ts 작성 시작
3. ⬜ IMEHandler helper 메서드 추가
4. ⬜ Constructor에서 IMEHandler 초기화
5. ⬜ 필요한 메서드들에 IME 로직 통합
6. ⬜ 테스트
