import { useEffect, useState } from "react"
import { useNavigate, useParams, Outlet } from "react-router-dom"
import { Helmet } from "react-helmet"
import { MessageBoard, MessageRoomViewHeader } from "@zuri/ui"
import { subscribeToChannel } from "@zuri/utilities"
import { Container, MessagingArea, MessageWrapper } from "./MessageBoard.style"
import fetchDefaultRoom from "../../utils/fetchDefaultRoom"
import { useSelector, useDispatch } from "react-redux"
import getMessageSender from "../../utils/getMessageSender.js"
import {
  messagesApi,
  useGetMessagesInRoomQuery,
  useSendMessageInRoomMutation,
  useSendMessageWithFileMutation,
  useUpdateMessageInRoomMutation
} from "../../redux/services/messages.js"
import { useGetRoomsAvailableToUserQuery } from "../../redux/services/rooms"
import generatePageTitle from "../../utils/generatePageTitle"

//
const MessagingBoard = () => {
  const { roomId } = useParams()
  const navigateTo = useNavigate()
  const dispatch = useDispatch()
  const authUser = useSelector(state => state.authUser)
  const currentWorkspaceId = localStorage.getItem("currentWorkspace")
  const [pageTitle, setPageTitle] = useState("")
  const [roomName, setRoomName] = useState("unknown-channel")
  const [pageIndex, setPageIndex] = useState(1)
  const [roomChats, setRoomChats] = useState([])
  const [refresh, setRefresh] = useState(false)
  const [fileData, setFileData] = useState(null)

  const [showEmoji, setShowEmoji] = useState(false)
  const [isProcessing, setIsProcessing] = useState({
    status: false,
    message: []
  })
  const chatSize = 15
  const { data: roomsAvailable, isLoading: IsLoadingRoomsAvailable } =
    useGetRoomsAvailableToUserQuery(
      {
        orgId: currentWorkspaceId,
        userId: authUser.user_id,
        refresh
      },
      {
        skip: Boolean(!authUser.user_id),
        refetchOnMountOrArgChange: true
      }
    )
  const { data: data, isLoading: isLoadingRoomMessages } =
    useGetMessagesInRoomQuery(
      {
        orgId: currentWorkspaceId,
        roomId,
        pageIndex
      },
      {
        skip: Boolean(!roomId),
        refetchOnMountOrArgChange: true
      }
    )
  const [sendNewMessage, { isLoading: isSending }] =
    useSendMessageInRoomMutation()

  const [sendNewMessageWithFile, { isLoading: isPending }] =
    useSendMessageWithFileMutation()

  const [updateMessage] = useUpdateMessageInRoomMutation()

  useEffect(() => {
    if (!roomId) {
      fetchDefaultRoom(currentWorkspaceId, authUser?.user_id).then(result => {
        navigateTo(`/${result.room_id}`, { replace: true })
      })
    }
    if (roomId && authUser.user_id) {
      subscribeToChannel(roomId, data => {
        if (data.data.data.sender_id !== authUser.user_id) {
          getMessageSender(data.data.data.sender_id).then(sender => {
            dispatch(
              messagesApi.util.updateQueryData(
                "getMessagesInRoom",
                {
                  orgId: currentWorkspaceId,
                  roomId
                },
                draftMessages => {
                  draftMessages.push({
                    sender: {
                      sender_name: sender?.user_name,
                      sender_image_url:
                        sender?.image_url ||
                        `https://i.pravatar.cc/300?u=${sender?._id}`
                    },
                    ...data.data.data
                  })
                }
              )
            )
          })
        }
      })
    }
  }, [roomId, authUser])

  useEffect(() => {
    if (roomsAvailable) {
      const room = roomsAvailable[roomId]
      if (!room?.room_name) {
        setRefresh(!refresh)
      }
      setRoomName(room?.room_name)
      setPageTitle(generatePageTitle(room?.room_name))
      setPageIndex(1)
      if (pageIndex === 1 && data?.roomMessages) {
        setRoomChats(data?.roomMessages)
      }
    }
  }, [roomId, roomsAvailable])
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

  function generateString() {
    let result = " "
    const charactersLength = characters.length
    for (let i = 0; i < 10; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength))
    }
    return result
  }

  const sendMessageHandler = async message => {
    const currentDate = new Date()
    if (message.blocks[0].text) {
      const newMessage = {
        timestamp: currentDate.getTime(),
        emojis: [],
        richUiData: message
      }
      const newMessages = [
        {
          ...newMessage,
          _id: generateString(),
          orgId: currentWorkspaceId,
          roomId,
          sender: {
            sender_id: authUser?.user_id,
            sender_name: authUser?.user_name,
            sender_image_url: authUser?.user_image_url
          }
        }
      ]
      setIsProcessing({ status: true, message: roomChats.concat(newMessages) })
    }
    if (fileData) {
      var formData = new FormData()
      formData.append("sender_id", authUser?.user_id)
      formData.append("timestamp", currentDate.getTime())
      formData.append("richUiData", JSON.stringify(message))
      fileData.forEach(file => {
        formData.append("attachments", file)
      })
      sendNewMessageWithFile({
        orgId: currentWorkspaceId,
        roomId,
        messageData: formData
      })
    } else {
      sendNewMessage({
        orgId: currentWorkspaceId,
        roomId,
        sender: {
          sender_id: authUser?.user_id,
          sender_name: authUser?.user_name,
          sender_image_url: authUser?.user_image_url
        },
        messageData: { ...newMessage }
      })
        .then(e => {
          const newMessages = [
            {
              ...newMessage,
              _id: e.data.data.message_id,
              orgId: currentWorkspaceId,
              roomId,
              sender: {
                sender_id: authUser?.user_id,
                sender_name: authUser?.user_name,
                sender_image_url: authUser?.user_image_url
              }
            }
          ]
          setRoomChats(prev => prev.concat(newMessages))
          setIsProcessing({ status: false, message: [] })
        })
        .catch(() => {
          setIsProcessing({ status: false, message: [] })
        })
    }
    return true
  }

  const reactHandler = (event, emojiObject, messageId) => {
    const currentUserId = authUser?.user_id
    const newMessages = [...roomChats]

    // if message_id is not undefined then it's coming from already rendered emoji in message container

    const emoji = emojiObject.character
    const newEmojiName = emojiObject.unicodeName || emojiObject.name
    const messageIndex = newMessages.findIndex(
      message => message._id === messageId
    )

    if (messageIndex < 0) {
      return
    }

    const message = newMessages[messageIndex]

    const emojiIndex = message.emojis.findIndex(
      emoji => emoji.name.toLowerCase() === newEmojiName.toLowerCase()
    )

    if (emojiIndex >= 0) {
      //the emoji exists in the message
      const reactedUsersId = message.emojis[emojiIndex].reactedUsersId
      const reactedUserIdIndex = reactedUsersId.findIndex(
        id => id === currentUserId
      )
      if (reactedUserIdIndex >= 0) {
        // the current user has reacted with this emoji before
        // now, if the user is the only person that has reacted, then the emoji
        // should be removed entirely.
        if (message.emojis[emojiIndex].count <= 1) {
          let emojisArray = message.emojis.filter(
            emoji => emoji.name.toLowerCase() !== newEmojiName.toLowerCase()
          )
          let updatedMessage = {
            ...message,
            emojis: emojisArray,
            edited: true,
            message_id: messageId
          }
          //   Finds the message ID and updates the emojis array for the particular message
          const newState = roomChats.map(chat => {
            if (chat._id === messageId) {
              return { ...updatedMessage }
            }
            return chat
          })
          //    sets the message array state
          setRoomChats(newState)
          //
          updateMessage({
            orgId: currentWorkspaceId,
            roomId,
            sender: {
              sender_id: authUser?.user_id,
              sender_name: authUser?.user_name,
              sender_image_url: authUser?.user_image_url
            },
            messageData: { ...updatedMessage },
            messageId: updatedMessage._id
          })
          // message.emojis.splice(emojiIndex, 1)
        } else {
          message.emojis[emojiIndex].reactedUsersId.splice(reactedUserIdIndex)
          message.emojis[emojiIndex].count =
            message.emojis[emojiIndex].count - 1
        }
      } else {
        // the user has not reacted and will now be added to the list and count incremented
        message.emojis[emojiIndex].reactedUsersId = [
          ...message.emojis[emojiIndex].reactedUsersId,
          currentUserId
        ]
        // message.emojis[emojiIndex].count = message.emojis[emojiIndex].count + 1
      }
    } else {
      // the emoji does not exist
      // create the emoji object and push
      const newEmojiObject = {
        name: newEmojiName,
        count: 1,
        emoji: emoji,
        reactedUsersId: [currentUserId]
      }
      let emojisArray = [...message.emojis, newEmojiObject]
      let updatedMessage = {
        ...message,
        emojis: emojisArray,
        edited: true,
        message_id: messageId
      }
      //   Finds the message ID and updates the emojis array for the particular message
      const newState = roomChats.map(chat => {
        if (chat._id === messageId) {
          return { ...updatedMessage }
        }
        return chat
      })
      //    sets the message array state
      setRoomChats(newState)
      //
      updateMessage({
        orgId: currentWorkspaceId,
        roomId,
        sender: {
          sender_id: authUser?.user_id,
          sender_name: authUser?.user_name,
          sender_image_url: authUser?.user_image_url
        },
        messageData: { ...updatedMessage },
        messageId: updatedMessage._id
      })
    }
    setShowEmoji(false)
    return false
  }

  const SendAttachedFileHandler = file => {
    setFileData(file)
  }

  const handleScroll = event => {
    const numPage = Math.ceil(data.total / chatSize)
    if (event.currentTarget.scrollTop === 0 && pageIndex < numPage) {
      setPageIndex(prev => prev + 1)
    }
  }
  useEffect(() => {
    if (data?.roomMessages.length) {
      setRoomChats(prev => data.roomMessages.concat(prev))
    }
  }, [data?.roomMessages])

  //
  //
  return roomId ? (
    <>
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>
      <Container>
        <MessagingArea>
          <MessageWrapper>
            <MessageRoomViewHeader name={`#${roomName}`} />
            <MessageBoard
              isLoadingMessages={isLoadingRoomMessages}
              messages={
                (isProcessing.status === true
                  ? isProcessing.message
                  : roomChats) || []
              }
              onSendMessage={sendMessageHandler}
              onReact={reactHandler}
              onSendAttachedFile={SendAttachedFileHandler}
              currentUserId={authUser?.user_id}
              height={"92vh"}
              onHandleScroll={handleScroll}
              showEmoji={showEmoji}
              setShowEmoji={setShowEmoji}
            />
          </MessageWrapper>
          {/* <TypingNotice>Omo Jesu is typing</TypingNotice> */}
        </MessagingArea>

        {/* 
      Right sidebar like thread, profile and co
      ... All routed in InMessageRoute component
    */}
        <Outlet />
      </Container>
    </>
  ) : null
}

export default MessagingBoard
