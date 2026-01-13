import Quill from "quill";
import type { Mention } from "./mention";
import { getMentionCharIndex, hasValidChars, hasValidMentionCharIndex } from "./utils";

// Rfice :: IME (Input Method Editor) 입력을 처리하는 핸들러
// 한글, 중국어, 일본어 등 composition 이벤트를 사용하는 모든 언어 지원
export class IMEHandler {
	private mention: Mention;
	private quill: Quill;

	// Rfice :: IME composition 상태 추적
	private isComposing: boolean = false;

	// Rfice :: composition 중 실제 업데이트가 있었는지 추적
	private isCompositionUpdated: boolean = false;

	// Rfice :: 다음 compositionend에서 재렌더링 건너뛰기 (화살표 키, 엔터 선택 등)
	private skipNextCompositionEnd: boolean = false;

	constructor(mention: Mention, quill: Quill) {
		this.mention = mention;
		this.quill = quill;

		this.setupEventListeners();
	}

	// Rfice :: IME 이벤트 리스너 설정
	private setupEventListeners() {
		// Rfice :: 한글 IME composition 이벤트 리스너 등록
		this.quill.root.addEventListener(
			"compositionstart",
			this.onCompositionStart.bind(this),
		);
		this.quill.root.addEventListener(
			"compositionupdate",
			this.onCompositionUpdate.bind(this),
		);
		this.quill.root.addEventListener(
			"compositionend",
			this.onCompositionEnd.bind(this),
		);

		// Rfice :: 화살표 키 감지 (composition 중)
		this.quill.root.addEventListener("keydown", (event: KeyboardEvent) => {
			if (
				this.isComposing &&
				this.mention.isOpen &&
				(event.key === "ArrowUp" || event.key === "ArrowDown")
			) {
				this.skipNextCompositionEnd = true;
			}
		});

		// Rfice :: document 레벨에서 Escape 키 캡처 (멘션 리스트가 열려있을 때만)
		// useCapture: true로 상위 컴포넌트(useEscape)보다 먼저 실행
		const handleEscapeKey = (event: KeyboardEvent) => {
			if (this.mention.isOpen && event.key === "Escape") {
				event.preventDefault(); // 브라우저 기본 동작 방지
				event.stopImmediatePropagation(); // 다른 document 리스너 차단

				// Rfice :: 한글 IME composition 중이라면 다음 compositionend 건너뛰기
				if (this.isComposing) {
					this.skipNextCompositionEnd = true;
				}

				// Rfice :: cleanup: 비동기 검색 취소 + 멘션 리스트 닫기
				this.mention.handleEscape();
			}
		};
		document.addEventListener("keydown", handleEscapeKey, true);
	}

	// Rfice :: 현재 IME composition 중인지 확인
	public isComposingNow(): boolean {
		return this.isComposing;
	}

	// Rfice :: 다음 compositionend를 건너뛰도록 설정
	public setSkipNextCompositionEnd() {
		this.skipNextCompositionEnd = true;
	}

	// Rfice :: 한글 IME composition 시작
	private onCompositionStart() {
		this.isComposing = true;
		// Rfice :: composition 업데이트 플래그 초기화
		this.isCompositionUpdated = false;
	}

	// Rfice :: 한글 IME composition 중 업데이트 - 실시간 검색 수행
	private onCompositionUpdate(event: CompositionEvent) {
		// Rfice :: 실제 입력이 있었음을 기록 (화살표 키와 구분)
		this.isCompositionUpdated = true;

		// Rfice :: composition 중에도 멘션 위치 유효성을 재검증
		const range = this.quill.getSelection();
		if (range == null) return;

		const cursorPos = range.index;
		const maxChars = this.mention.getMaxChars();
		const startPos = Math.max(0, cursorPos - maxChars);
		const textBeforeCursorPos = this.quill.getText(startPos, cursorPos - startPos);

		const textOffset = Math.max(0, cursorPos - maxChars);
		const textPrefix = textOffset
			? this.quill.getText(textOffset - 1, textOffset)
			: "";

		const mentionDenotationChars = this.mention.getMentionDenotationChars();
		const isolateCharacter = this.mention.getIsolateCharacter();
		const allowInlineMentionChar = this.mention.getAllowInlineMentionChar();

		const { mentionChar, mentionCharIndex } = getMentionCharIndex(
			textBeforeCursorPos,
			mentionDenotationChars,
			isolateCharacter,
			allowInlineMentionChar,
		);

		// Rfice :: 유효한 멘션 위치인지 확인
		if (
			mentionChar !== null &&
			hasValidMentionCharIndex(
				mentionCharIndex,
				textBeforeCursorPos,
				isolateCharacter,
				textPrefix,
			)
		) {
			const mentionCharPos =
				cursorPos - (textBeforeCursorPos.length - mentionCharIndex);
			this.mention.setMentionCharPos(mentionCharPos);

			// Rfice :: composition 중에는 에디터의 확정된 텍스트 + composition 데이터를 합쳐서 검색
			if (event.data) {
				// Rfice :: @ 위치부터 현재 커서 위치까지의 확정된 텍스트 가져오기
				const confirmedText = this.quill.getText(
					mentionCharPos,
					range.index - mentionCharPos,
				);

				// Rfice :: @ 다음 텍스트 = 확정된 텍스트에서 @ 제거
				const confirmedAfterMention = confirmedText.substring(
					mentionChar.length,
				);

				// Rfice :: 전체 검색어 = 확정된 텍스트 + 현재 composition 중인 텍스트
				// 단, event.data에 @ 이후의 모든 텍스트가 포함된 경우가 있으므로 확인 필요
				const searchTerm = event.data.startsWith(confirmedAfterMention)
					? event.data
					: confirmedAfterMention + event.data;

				const minChars = this.mention.getMinChars();
				const allowedCharsRegex = this.mention.getAllowedCharsRegex(mentionChar);

				// Rfice :: 검색어가 유효한지 확인
				if (
					searchTerm.length >= minChars &&
					hasValidChars(searchTerm, allowedCharsRegex)
				) {
					this.mention.performSearch(searchTerm, mentionChar);
				} else {
					// Rfice :: 검색어가 유효하지 않으면 리스트 숨김
					this.mention.cancelSearchAndHide();
				}
			}
		} else {
			// Rfice :: 유효한 멘션 위치가 아니면 리스트 숨김
			this.mention.cancelSearchAndHide();
		}
	}

	// Rfice :: 한글 IME composition 종료
	private onCompositionEnd() {
		this.isComposing = false;

		// Rfice :: 다음 compositionend를 건너뛰어야 하는 경우 (화살표 키, 엔터 선택 등)
		if (this.skipNextCompositionEnd) {
			this.skipNextCompositionEnd = false;
			return;
		}

		// Rfice :: 리스트가 열려있고 실제 업데이트가 있었으면 재렌더링
		if (this.mention.isOpen && this.isCompositionUpdated) {
			setTimeout(() => {
				this.mention.triggerSomethingChange();
			}, 0);
		}

		// Rfice :: 플래그 리셋
		this.isCompositionUpdated = false;
	}
}
