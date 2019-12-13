// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, FormattedDate, FormattedTime} from 'react-intl';
import AutoSizer from 'react-virtualized-auto-sizer';
import {DynamicSizeList} from 'react-window';
import {isDateLine, isStartOfNewMessages} from 'mattermost-redux/utils/post_list';

import EventEmitter from 'mattermost-redux/utils/event_emitter';

import Constants, {PostListRowListIds, EventTypes, PostRequestTypes} from 'utils/constants';
import DelayedAction from 'utils/delayed_action';
import {getPreviousPostId, getLatestPostId, isIdNotPost} from 'utils/post_utils.jsx';
import {intlShape} from 'utils/react_intl';
import * as Utils from 'utils/utils.jsx';

import FloatingTimestamp from 'components/post_view/floating_timestamp';
import PostListRow from 'components/post_view/post_list_row';
import ScrollToBottomArrows from 'components/post_view/scroll_to_bottom_arrows';
import UnreadToast from 'components/toast/toast';

const OVERSCAN_COUNT_BACKWARD = window.OVERSCAN_COUNT_BACKWARD || 80; // Exposing the value for PM to test will be removed soon
const OVERSCAN_COUNT_FORWARD = window.OVERSCAN_COUNT_FORWARD || 80; // Exposing the value for PM to test will be removed soon
const HEIGHT_TRIGGER_FOR_MORE_POSTS = window.HEIGHT_TRIGGER_FOR_MORE_POSTS || 1000; // Exposing the value for PM to test will be removed soon
const BUFFER_TO_BE_CONSIDERED_BOTTOM = 10;

const MAXIMUM_POSTS_FOR_SLICING = {
    channel: 50,
    permalink: 100,
};

const postListStyle = {
    padding: '14px 0px 7px',
};

const virtListStyles = {
    position: 'absolute',
    bottom: '0',
    maxHeight: '100%',
};

const TOAST_FADEOUT_TIME_UNREAD = 4000;
const TOAST_FADEOUT_TIME = 500;
const OFFSET_TO_SHOW_TOAST = -30;

export default class PostList extends React.PureComponent {
    static propTypes = {

        /**
         * Array of Ids in the channel including date separators, new message indicator, more messages loader,
         * manual load messages trigger and postId in the order of newest to oldest for populating virtual list rows
         */
        postListIds: PropTypes.array.isRequired,

        /**
         * Set to focus this post
         */
        focusedPostId: PropTypes.string,

        /**
         * The current channel id
         */
        channelId: PropTypes.string.isRequired,

        /**
         * Used for disabling auto retry of posts and enabling manual link for loading posts
         */
        autoRetryEnable: PropTypes.bool,

        /**
         * used for populating header, scroll correction and disabling triggering loadOlderPosts
         */
        atOldestPost: PropTypes.bool,

        /**
         * used for disabling triggering loadNewerPosts
         */
        atLatestPost: PropTypes.bool,

        latestPostTimeStamp: PropTypes.number,

        latestAriaLabelFunc: PropTypes.func,

        unreadCountInChannel: PropTypes.number,

        newRecentMessagesCount: PropTypes.number,

        channelMarkedAsUnread: PropTypes.bool,

        lastViewedAt: PropTypes.string,

        actions: PropTypes.shape({

            /**
             * Function to get older posts in the channel
             */
            loadOlderPosts: PropTypes.func.isRequired,

            /**
             * Function to get newer posts in the channel
             */
            loadNewerPosts: PropTypes.func.isRequired,

            /**
             * Function used for autoLoad of posts incase screen is not filled with posts
             */
            canLoadMorePosts: PropTypes.func.isRequired,

            /**
             * Function to check and set if app is in mobile view
             */
            checkAndSetMobileView: PropTypes.func.isRequired,

            /**
             * Function to change the post selected for postList
             */
            changeUnreadChunkTimeStamp: PropTypes.func.isRequired,

            updateLastViewedChannel: PropTypes.func.isRequired,
        }).isRequired,
    }

    static contextTypes = {
        intl: intlShape.isRequired,
    };

    constructor(props) {
        super(props);

        const channelIntroMessage = PostListRowListIds.CHANNEL_INTRO_MESSAGE;
        const isMobile = Utils.isMobile();
        this.state = {
            isScrolling: false,
            isMobile,
            atBottom: true,
            lastViewedBottom: Date.now(),
            postListIds: [channelIntroMessage],
            topPostId: '',
            postMenuOpened: false,
            dynamicListStyle: {
                willChange: 'transform',
            },
            unreadCountInChannel: props.unreadCountInChannel,
        };

        this.listRef = React.createRef();
        this.postListRef = React.createRef();
        this.forceUnreadEvenAtBottom = true;
        if (isMobile) {
            this.scrollStopAction = new DelayedAction(this.handleScrollStop);
        }

        this.initRangeToRender = this.props.focusedPostId ? [0, MAXIMUM_POSTS_FOR_SLICING.permalink] : [0, MAXIMUM_POSTS_FOR_SLICING.channel];

        let postIndex = 0;
        if (props.focusedPostId) {
            postIndex = this.props.postListIds.findIndex((postId) => postId === this.props.focusedPostId);
        } else {
            postIndex = this.getNewMessagesSeparatorIndex(props.postListIds);
        }

        const maxPostsForSlicing = props.focusedPostId ? MAXIMUM_POSTS_FOR_SLICING.permalink : MAXIMUM_POSTS_FOR_SLICING.channel;
        this.initRangeToRender = [
            Math.max(postIndex - 30, 0),
            Math.max(postIndex + 30, Math.min(props.postListIds.length - 1, maxPostsForSlicing)),
        ];
    }

    componentDidMount() {
        this.mounted = true;
        this.props.actions.checkAndSetMobileView();

        window.addEventListener('resize', this.handleWindowResize);
        document.addEventListener('keydown', this.handleShortcut);

        EventEmitter.addListener(EventTypes.POST_LIST_SCROLL_TO_BOTTOM, this.scrollToLatestMessages);
        this.forceShowUnreadToastTimer = setTimeout(() => {
            this.forceUnreadEvenAtBottom = false;
        }, TOAST_FADEOUT_TIME_UNREAD);
    }

    getSnapshotBeforeUpdate(prevProps) {
        if (this.postListRef && this.postListRef.current) {
            const postsAddedAtTop = this.props.postListIds && this.props.postListIds.length !== prevProps.postListIds.length && this.props.postListIds[0] === prevProps.postListIds[0];
            const channelHeaderAdded = this.props.atOldestPost !== prevProps.atOldestPost;
            if ((postsAddedAtTop || channelHeaderAdded) && !this.state.atBottom) {
                const postListNode = this.postListRef.current;
                const previousScrollTop = postListNode.parentElement.scrollTop;
                const previousScrollHeight = postListNode.scrollHeight;

                return {
                    previousScrollTop,
                    previousScrollHeight,
                };
            }
        }
        return null;
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (!this.postListRef.current) {
            return;
        }
        const prevPostsCount = prevProps.postListIds.length;
        const presentPostsCount = this.props.postListIds.length;
        const postsAddedAtBottom = presentPostsCount !== prevPostsCount && this.props.postListIds[presentPostsCount - 1] === prevProps.postListIds[prevPostsCount - 1];
        const notBottomWithLatestPosts = !this.state.atBottom && this.props.atLatestPost && presentPostsCount > 0;

        //Marking exiting messages as read based on last time user reached to the bottom
        //This moves the new message indicator to the latest posts and keeping in sync with the toast count
        if (postsAddedAtBottom && notBottomWithLatestPosts && !this.state.showUnreadToast) {
            this.props.actions.updateLastViewedChannel(this.props.channelId, this.state.lastViewedBottom);
        }

        if (snapshot) {
            const postlistScrollHeight = this.postListRef.current.scrollHeight;
            const postsAddedAtTop = presentPostsCount !== prevPostsCount && this.props.postListIds[0] === prevProps.postListIds[0];
            const channelHeaderAdded = this.props.atOldestPost !== prevProps.atOldestPost;
            if ((postsAddedAtTop || channelHeaderAdded) && !this.state.atBottom && snapshot) {
                const scrollValue = snapshot.previousScrollTop + (postlistScrollHeight - snapshot.previousScrollHeight);
                if (scrollValue !== 0 && (scrollValue - snapshot.previousScrollTop) !== 0) {
                    //true as third param so chrome can use animationFrame when correcting scroll
                    this.listRef.current.scrollTo(scrollValue, scrollValue - snapshot.previousScrollTop, true);
                }
            }
        }
    }

    componentWillUnmount() {
        this.mounted = false;
        window.removeEventListener('resize', this.handleWindowResize);
        document.removeEventListener('keydown', this.handleShortcut);
        EventEmitter.removeListener(EventTypes.POST_LIST_SCROLL_TO_BOTTOM, this.scrollToLatestMessages);
    }

    static getDerivedStateFromProps(props, prevState) {
        const postListIds = props.postListIds;
        let newPostListIds;
        let unreadCount;
        let {showUnreadToast, showNewMessagesToast} = prevState;

        if (props.atOldestPost) {
            newPostListIds = [...postListIds, PostListRowListIds.CHANNEL_INTRO_MESSAGE];
        } else if (props.autoRetryEnable) {
            newPostListIds = [...postListIds, PostListRowListIds.OLDER_MESSAGES_LOADER];
        } else {
            newPostListIds = [...postListIds, PostListRowListIds.LOAD_OLDER_MESSAGES_TRIGGER];
        }

        if (!props.atLatestPost) {
            if (props.autoRetryEnable) {
                newPostListIds = [PostListRowListIds.NEWER_MESSAGES_LOADER, ...newPostListIds];
            } else {
                newPostListIds = [PostListRowListIds.LOAD_NEWER_MESSAGES_TRIGGER, ...newPostListIds];
            }
        }

        if (props.atLatestPost) {
            unreadCount = PostList.countNewMessages(postListIds);
        } else if (props.channelMarkedAsUnread) {
            unreadCount = prevState.unreadCountInChannel;
        } else {
            unreadCount = prevState.unreadCountInChannel + props.newRecentMessagesCount;
        }

        if (typeof showUnreadToast === 'undefined') {
            showUnreadToast = unreadCount > 0;
        }

        if (props.channelMarkedAsUnread && !prevState.channelMarkedAsUnread && !prevState.showUnreadToast) {
            showUnreadToast = true;
        }

        if (!showUnreadToast && !prevState.atBottom && unreadCount > 0 && (prevState.lastViewedBottom < props.latestPostTimeStamp)) {
            showNewMessagesToast = true;
        }

        return {
            postListIds: newPostListIds,
            unreadCount,
            showUnreadToast,
            showNewMessagesToast,
            channelMarkedAsUnread: props.channelMarkedAsUnread,
        };
    }

    getNewMessagesSeparatorIndex = (postListIds) => {
        return postListIds.findIndex(
            (item) => item.indexOf(PostListRowListIds.START_OF_NEW_MESSAGES) === 0
        );
    }

    handleShortcut = (e) => {
        if (Utils.cmdOrCtrlPressed(e) && Utils.isKeyPressed(e, Constants.KeyCodes.J)) {
            if (this.state.showUnreadToast) {
                this.scrollToLatestMessages();
            } else if (this.state.showNewMessagesToast) {
                this.scrollToUnread();
            }
        }

        if (Utils.isKeyPressed(e, Constants.KeyCodes.ESCAPE)) {
            if (this.state.showUnreadToast) {
                this.hideUnreadToast();
            } else if (this.state.showNewMessagesToast) {
                this.hideNewMessagesToast();
            }
        }
    };

    handleWindowResize = () => {
        this.props.actions.checkAndSetMobileView();
        const isMobile = Utils.isMobile();
        if (isMobile !== this.state.isMobile) {
            const dynamicListStyle = this.state.dynamicListStyle;
            if (this.state.postMenuOpened) {
                if (!isMobile && dynamicListStyle.willChange === 'unset') {
                    dynamicListStyle.willChange = 'transform';
                } else if (isMobile && dynamicListStyle.willChange === 'transform') {
                    dynamicListStyle.willChange = 'unset';
                }
            }

            this.setState({
                isMobile,
                dynamicListStyle,
            });
            this.scrollStopAction = new DelayedAction(this.handleScrollStop);
        }
    }

    togglePostMenu = (opened) => {
        const dynamicListStyle = this.state.dynamicListStyle;
        if (this.state.isMobile) {
            dynamicListStyle.willChange = opened ? 'unset' : 'transform';
        }

        this.setState({
            postMenuOpened: opened,
            dynamicListStyle,
        });
    };

    renderRow = ({data, itemId, style}) => {
        const index = data.indexOf(itemId);
        let className = '';
        const basePaddingClass = 'post-row__padding';
        const previousItemId = (index !== -1 && index < data.length - 1) ? data[index + 1] : '';
        const nextItemId = (index > 0 && index < data.length) ? data[index - 1] : '';

        if (isDateLine(nextItemId) || isStartOfNewMessages(nextItemId)) {
            className += basePaddingClass + ' bottom';
        }

        if (isDateLine(previousItemId) || isStartOfNewMessages(previousItemId)) {
            if (className.includes(basePaddingClass)) {
                className += ' top';
            } else {
                className += basePaddingClass + ' top';
            }
        }

        return (
            <div
                style={style}
                className={className}
            >
                <PostListRow
                    listId={itemId}
                    previousListId={getPreviousPostId(data, index)}
                    shouldHighlight={itemId === this.props.focusedPostId}
                    loadOlderPosts={this.props.actions.loadOlderPosts}
                    loadNewerPosts={this.props.actions.loadNewerPosts}
                    togglePostMenu={this.togglePostMenu}
                />
            </div>
        );
    };

    itemKey = (index) => {
        const {postListIds} = this.state;
        return postListIds[index] ? postListIds[index] : index;
    }

    scrollTofailed = (index) => {
        if (index === 0) {
            this.props.actions.changeUnreadChunkTimeStamp('');
        } else {
            this.props.actions.changeUnreadChunkTimeStamp(this.props.lastViewedAt);
        }
    }

    onScroll = ({scrollDirection, scrollOffset, scrollUpdateWasRequested, clientHeight, scrollHeight}) => {
        const didUserScrollBackwards = scrollDirection === 'backward' && !scrollUpdateWasRequested;
        const didUserScrollForwards = scrollDirection === 'forward' && !scrollUpdateWasRequested;
        const isOffsetWithInRange = scrollOffset < HEIGHT_TRIGGER_FOR_MORE_POSTS;
        const offsetFromBottom = (scrollHeight - clientHeight) - scrollOffset < HEIGHT_TRIGGER_FOR_MORE_POSTS;

        if (didUserScrollBackwards && isOffsetWithInRange && !this.props.atOldestPost) {
            this.props.actions.loadOlderPosts();
        } else if (didUserScrollForwards && offsetFromBottom && !this.props.atLatestPost) {
            this.props.actions.loadNewerPosts();
        }

        if (this.state.isMobile) {
            if (!this.state.isScrolling) {
                this.setState({
                    isScrolling: true,
                });
            }

            if (this.scrollStopAction) {
                this.scrollStopAction.fireAfter(Constants.SCROLL_DELAY);
            }
        }

        if (scrollUpdateWasRequested) { //if scroll change is programatically requested i.e by calling scrollTo
            //This is a private method on virtlist
            const postsRenderedRange = this.listRef.current._getRangeToRender(); //eslint-disable-line no-underscore-dangle

            // postsRenderedRange[3] is the visibleStopIndex which is post at the bottom of the screen
            if (postsRenderedRange[3] <= 1 && !this.props.atLatestPost) {
                this.props.actions.canLoadMorePosts(PostRequestTypes.AFTER_ID);
            }
        }

        if (scrollHeight > 0) {
            this.checkBottom(scrollOffset, scrollHeight, clientHeight);
        }
    }

    checkBottom = (scrollOffset, scrollHeight, clientHeight) => {
        this.updateAtBottom(this.isAtBottom(scrollOffset, scrollHeight, clientHeight));
    }

    isAtBottom = (scrollOffset, scrollHeight, clientHeight) => {
        // Calculate how far the post list is from being scrolled to the bottom
        const offsetFromBottom = scrollHeight - clientHeight - scrollOffset;

        return offsetFromBottom <= BUFFER_TO_BE_CONSIDERED_BOTTOM && scrollHeight > 0;
    }

    hideNewMessagesToast = (dismiss = true) => {
        if (this.state.showNewMessagesToast) {
            if (dismiss) {
                this.setState({
                    showNewMessagesToast: false,
                    lastViewedBottom: Date.now()
                });
                return;
            }
            setTimeout(() => {
                this.setState({showNewMessagesToast: false});
            }, TOAST_FADEOUT_TIME);
        }
    }

    hideUnreadToast = (dismiss = true) => {
        if (this.state.showUnreadToast) {
            if (dismiss) {
                this.setState({showUnreadToast: false});
                return;
            }
            setTimeout(() => {
                this.setState({showUnreadToast: false});
            }, this.forceUnreadEvenAtBottom ? TOAST_FADEOUT_TIME_UNREAD : TOAST_FADEOUT_TIME);
        }
    }

    updateAtBottom = (atBottom) => {
        if (atBottom !== this.state.atBottom) {
            // Update lastViewedBottom when the list reaches or leaves the bottom
            let lastViewedBottom = Date.now();
            if (this.props.latestPostTimeStamp > lastViewedBottom) {
                lastViewedBottom = this.props.latestPostTimeStamp;
            }

            // if we hit the bottom, we haven't just landed on the unread channel
            this.setState({
                atBottom,
                lastViewedBottom,
            });

            if (atBottom && this.props.atLatestPost) {
                this.hideUnreadToast(false);
                this.hideNewMessagesToast(false);
            }
        }
    }

    handleScrollStop = () => {
        if (this.mounted) {
            this.setState({
                isScrolling: false,
            });
        }
    }

    updateFloatingTimestamp = (visibleTopItem) => {
        if (!this.state.isMobile) {
            return;
        }

        if (!this.props.postListIds) {
            return;
        }

        this.setState({
            topPostId: getLatestPostId(this.props.postListIds.slice(visibleTopItem)),
        });
    }

    onItemsRendered = ({visibleStartIndex}) => {
        this.updateFloatingTimestamp(visibleStartIndex);
    }

    static getNewMessageIndex = (postListIds) => {
        return postListIds.findIndex(
            (item) => item.indexOf(PostListRowListIds.START_OF_NEW_MESSAGES) === 0
        );
    }

    static countNewMessages = (postListIds) => {
        const mark = PostList.getNewMessageIndex(postListIds);
        if (mark <= 0) {
            return 0;
        }
        const newMessages = postListIds.slice(0, mark);
        return newMessages.filter((id) => !isIdNotPost(id)).length;
    }

    initScrollToIndex = () => {
        if (this.props.focusedPostId) {
            const index = this.state.postListIds.findIndex(
                (item) => item === this.props.focusedPostId
            );
            return {
                index,
                position: 'center',
            };
        }

        const newMessagesSeparatorIndex = PostList.getNewMessageIndex(this.state.postListIds);

        if (newMessagesSeparatorIndex > 0) {
            // if there is a dateLine above START_OF_NEW_MESSAGES then scroll to date line
            if (isDateLine(this.state.postListIds[newMessagesSeparatorIndex + 1])) {
                return {
                    index: newMessagesSeparatorIndex + 1,
                    position: 'start',
                    offset: OFFSET_TO_SHOW_TOAST,
                };
            }
            return {
                index: newMessagesSeparatorIndex,
                position: 'start',
                offset: OFFSET_TO_SHOW_TOAST,
            };
        }

        return {
            index: 0,
            position: 'end',
        };
    }

    scrollToLatestMessages = () => {
        if (this.props.atLatestPost) {
            this.scrollToBottom();
            this.hideUnreadToast(false);
        } else {
            this.props.actions.updateLastViewedChannel(this.props.channelId);
            this.props.actions.changeUnreadChunkTimeStamp('');
        }
    }

    scrollToBottom = () => {
        this.listRef.current.scrollToItem(0, 'end');
    }

    scrollToUnread = () => {
        this.listRef.current.scrollToItem(PostList.getNewMessageIndex(this.state.postListIds), 'start', OFFSET_TO_SHOW_TOAST);
        this.hideNewMessagesToast();
    }

    newMessagesToastText = (count, since) => {
        let msgSince = '';
        if (typeof since !== 'undefined') {
            msgSince = (
                <FormattedMessage
                    id='postlist.toast.since'
                    defaultMessage=' since {date} at {time}'
                    values={{
                        date: (
                            <FormattedDate
                                value={since}
                                weekday='short'
                                day='2-digit'
                                month='short'
                            />
                        ),
                        time: (
                            <FormattedTime
                                value={since}
                                hour='2-digit'
                                minute='2-digit'
                            />
                        ),
                    }}
                />
            );
        }
        return (
            <React.Fragment>
                <FormattedMessage
                    id='postlist.toast.newMessages'
                    defaultMessage={'{count, number} new {count, plural, one {message} other {messages}}'}
                    values={{count}}
                />
                {!this.state.isMobile && msgSince}
            </React.Fragment>
        );
    }

    updateLastViewedChannel = () => {
        this.props.actions.updateLastViewedChannel(this.props.channelId);
    }

    renderToasts = (width) => {
        let toastProps = {
            countUnread: this.state.unreadCount,
            show: false,
            width,
        };

        if (this.state.showUnreadToast && this.state.unreadCount > 0) {
            toastProps = {
                ...toastProps,
                onDismiss: this.hideUnreadToast,
                onClick: this.scrollToLatestMessages,
                onClickMessage: Utils.localizeMessage('postlist.toast.scrollToBottom', 'Jump to recents'),
                show: true,
                showActions: !this.props.atLatestPost || (this.props.atLatestPost && !this.state.atBottom),
            };
        } else if (this.state.showNewMessagesToast) {
            toastProps = {
                ...toastProps,
                onDismiss: this.hideNewMessagesToast,
                onClick: this.scrollToUnread,
                onClickMessage: Utils.localizeMessage('postlist.toast.scrollToLatest', 'Jump to new messages'),
                show: true,
                showActions: !this.props.atLatestPost || (this.props.atLatestPost && !this.state.atBottom),
            };
        }

        return (
            <UnreadToast {...toastProps}>
                {this.newMessagesToastText(this.state.unreadCount, this.state.lastViewedBottom)}
            </UnreadToast>
        );
    }

    render() {
        const channelId = this.props.channelId;
        let ariaLabel;
        if (this.props.latestAriaLabelFunc && this.props.postListIds.indexOf(PostListRowListIds.START_OF_NEW_MESSAGES) >= 0) {
            ariaLabel = this.props.latestAriaLabelFunc(this.context.intl);
        }
        const {dynamicListStyle} = this.state;

        return (
            <div
                role='list'
                className='a11y__region'
                data-a11y-sort-order='1'
                data-a11y-focus-child={true}
                data-a11y-order-reversed={true}
                data-a11y-loop-navigation={false}
                aria-label={Utils.localizeMessage('accessibility.sections.centerContent', 'message list main region')}
            >
                {this.state.isMobile && (
                    <React.Fragment>
                        <FloatingTimestamp
                            isScrolling={this.state.isScrolling}
                            isMobile={true}
                            postId={this.state.topPostId}
                            stylesOverride={this.state.showUnreadToast || this.state.showNewMessagesToast ? {top: '50px'} : null}
                        />
                        <ScrollToBottomArrows
                            isScrolling={this.state.isScrolling}
                            atBottom={this.state.atBottom}
                            onClick={this.scrollToBottom}
                        />
                    </React.Fragment>
                )}
                <div
                    role='presentation'
                    className='post-list-holder-by-time'
                    key={'postlist-' + channelId}
                >
                    <div
                        role='presentation'
                        className='post-list__table'
                    >
                        <div
                            id='postListContent'
                            className='post-list__content'
                        >
                            <span
                                className='sr-only'
                                aria-live='polite'
                            >
                                {ariaLabel}
                            </span>
                            <AutoSizer>
                                {({height, width}) => (
                                    <React.Fragment>
                                        <div>{this.renderToasts(width)}</div>
                                        <DynamicSizeList
                                            ref={this.listRef}
                                            height={height}
                                            width={width}
                                            className='post-list__dynamic'
                                            itemCount={this.state.postListIds.length}
                                            itemData={this.state.postListIds}
                                            itemKey={this.itemKey}
                                            overscanCountForward={OVERSCAN_COUNT_FORWARD}
                                            overscanCountBackward={OVERSCAN_COUNT_BACKWARD}
                                            onScroll={this.onScroll}
                                            initScrollToIndex={this.initScrollToIndex}
                                            canLoadMorePosts={this.props.actions.canLoadMorePosts}
                                            skipResizeClass='col__reply'
                                            innerRef={this.postListRef}
                                            style={{...virtListStyles, ...dynamicListStyle}}
                                            innerListStyle={postListStyle}
                                            initRangeToRender={this.initRangeToRender}
                                            loaderId={PostListRowListIds.OLDER_MESSAGES_LOADER}
                                            correctScrollToBottom={this.props.atLatestPost}
                                            onItemsRendered={this.onItemsRendered}
                                            scrollTofailed={this.scrollTofailed}
                                        >
                                            {this.renderRow}
                                        </DynamicSizeList>
                                    </React.Fragment>
                                )}
                            </AutoSizer>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}